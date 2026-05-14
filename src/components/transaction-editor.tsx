"use client";

import { Edit3, Loader2, Repeat, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { AutoLabelUndoButton } from "@/components/auto-label-undo-button";
import { ClassificationIndicator } from "@/components/classification-indicator";
import { SuggestionActions } from "@/components/suggestion-actions";
import {
  TransferLinkBadge,
  type TransferSummary,
} from "@/components/transfer-link-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseApiResponse } from "@/lib/api-client";
import {
  canUndoAutoLabel,
  getClassificationUiState,
} from "@/lib/classification/ui-state";
import { showErrorToast } from "@/lib/toast-errors";
import { formatMoney } from "@/lib/utils";

type TransactionStatus = "pending" | "posted" | "excluded";
type TransactionMetadata = Record<string, unknown> & {
  autoLabel?: {
    source?: string;
    confidence?: number;
    originalDescription?: string;
    originalMerchantName?: string | null;
    undone?: boolean;
  };
  providerDescription?: string;
  userEdits?: {
    descriptionEdited?: boolean;
    merchantNameEdited?: boolean;
    originalDescription?: string;
    originalMerchantName?: string | null;
  };
};

type TransactionEditorProps = {
  categories: Array<{ id: string; name: string }>;
  transaction: {
    id: string;
    source: "manual" | "enable_banking" | "import";
    amount: string;
    currency: string;
    date: string;
    merchantName: string | null;
    description: string;
    notes: string | null;
    metadata: TransactionMetadata | null;
    merchantId: string | null;
    categoryId: string | null;
    categoryName: string | null;
    categorySource: string | null;
    categoryConfidence: string | null;
    suggestedCategoryId: string | null;
    suggestedCategoryName: string | null;
    suggestedDescription: string | null;
    suggestedMerchantName: string | null;
    transactionType: string | null;
    paymentChannel: string | null;
    parserSource: string | null;
    originalAmount: string | null;
    originalCurrency: string | null;
    linkedTransactionId: string | null;
    transferGroupId: string | null;
    isRecurringCandidate: boolean;
    status: TransactionStatus;
    excludedFromBudget: boolean;
    accountName: string;
    transferSummary: TransferSummary | null;
    recurringBill: {
      billName: string;
      cadence: string;
      nextDueDate: string | null;
      isPossiblyCancelled: boolean;
    } | null;
  };
};

export function TransactionEditor({
  categories,
  transaction,
}: TransactionEditorProps) {
  const router = useRouter();
  const isManual = transaction.source === "manual";
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState(transaction.description);
  const [merchantName, setMerchantName] = useState(transaction.merchantName ?? "");
  const [notes, setNotes] = useState(transaction.notes ?? "");
  const [categoryId, setCategoryId] = useState(transaction.categoryId ?? "");
  const [status, setStatus] = useState<TransactionStatus>(transaction.status);
  const [excludedFromBudget, setExcludedFromBudget] = useState(
    transaction.excludedFromBudget,
  );
  const [amount, setAmount] = useState(transaction.amount);
  const [date, setDate] = useState(transaction.date);
  const classificationState = getClassificationUiState(transaction);
  const undoAvailable = canUndoAutoLabel(transaction);
  const providerDescription =
    transaction.metadata?.providerDescription ??
    transaction.metadata?.autoLabel?.originalDescription ??
    transaction.metadata?.userEdits?.originalDescription;
  const originalMerchant =
    transaction.metadata?.autoLabel?.originalMerchantName ??
    transaction.metadata?.userEdits?.originalMerchantName;
  const hasSuggestion = Boolean(transaction.suggestedCategoryId);
  const isOneSidedTransfer =
    !transaction.transferSummary &&
    transaction.excludedFromBudget &&
    (transaction.transactionType === "internal_transfer" ||
      transaction.transactionType === "investment");

  async function save() {
    setSaving(true);

    try {
      const payload: Record<string, unknown> = {
        description,
        merchantName: merchantName.trim() || null,
        notes: notes.trim() || null,
        categoryId: categoryId || null,
        status,
        excludedFromBudget,
      };

      if (isManual) {
        payload.amount = amount;
        payload.date = date;
      }

      const response = await fetch(`/api/transactions/${transaction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      await parseApiResponse(response);
      toast.success("Transaction updated");
      setEditing(false);
      router.refresh();
    } catch (error) {
      showErrorToast("Could not update transaction", error);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <tr className="border-b bg-secondary/20">
        <td colSpan={7} className="p-4">
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <ClassificationIndicator
                confidence={transaction.categoryConfidence}
                source={transaction.categorySource}
                state={classificationState}
              />
              <TransferLinkBadge summary={transaction.transferSummary} />
              {isOneSidedTransfer ? (
                <Badge className="border-sky-500/30 bg-sky-500/10 text-sky-700">
                  One-sided transfer
                </Badge>
              ) : null}
              {transaction.recurringBill ? (
                <Badge className="gap-1 border-purple-500/30 bg-purple-500/10 text-purple-700">
                  <Repeat className="size-3.5" />
                  {transaction.recurringBill.billName}
                </Badge>
              ) : null}
            </div>
            {hasSuggestion ? (
              <div className="grid gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div>
                  <p className="text-sm font-semibold">Review suggestion</p>
                  <p className="text-sm text-muted-foreground">
                    Suggested category:{" "}
                    <span className="font-medium text-foreground">
                      {transaction.suggestedCategoryName ?? "Unknown category"}
                    </span>
                  </p>
                  {transaction.suggestedMerchantName &&
                  transaction.suggestedMerchantName !== transaction.merchantName ? (
                    <p className="text-sm text-muted-foreground">
                      Merchant: {transaction.merchantName ?? "None"} -&gt;{" "}
                      {transaction.suggestedMerchantName}
                    </p>
                  ) : null}
                  {transaction.suggestedDescription &&
                  transaction.suggestedDescription !== transaction.description ? (
                    <p className="text-sm text-muted-foreground">
                      Description: {transaction.description} -&gt;{" "}
                      {transaction.suggestedDescription}
                    </p>
                  ) : null}
                </div>
                <SuggestionActions transactionId={transaction.id} />
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor={`transaction-description-${transaction.id}`}>
                  Description
                </Label>
                <Input
                  id={`transaction-description-${transaction.id}`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
                {!isManual ? (
                  <p className="text-xs text-muted-foreground">
                    The original bank label is kept in metadata for future import
                    learning.
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`transaction-merchant-${transaction.id}`}>
                  Merchant
                </Label>
                <Input
                  id={`transaction-merchant-${transaction.id}`}
                  value={merchantName}
                  onChange={(event) => setMerchantName(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`transaction-category-${transaction.id}`}>
                  Category
                </Label>
                <Select
                  value={categoryId}
                  onValueChange={(value) => setCategoryId(value === "__uncategorized__" ? "" : value)}
                >
                  <SelectTrigger id={`transaction-category-${transaction.id}`}>
                    <SelectValue placeholder="Uncategorized" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__uncategorized__">Uncategorized</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`transaction-status-${transaction.id}`}>Status</Label>
                <Select
                  value={status}
                  onValueChange={(value) =>
                    setStatus(value as TransactionStatus)
                  }
                >
                  <SelectTrigger id={`transaction-status-${transaction.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="posted">Posted</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="excluded">Excluded</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`transaction-date-${transaction.id}`}>Date</Label>
                <Input
                  id={`transaction-date-${transaction.id}`}
                  disabled={!isManual}
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`transaction-amount-${transaction.id}`}>Amount</Label>
                <Input
                  id={`transaction-amount-${transaction.id}`}
                  disabled={!isManual}
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`transaction-notes-${transaction.id}`}>Notes</Label>
                <Input
                  id={`transaction-notes-${transaction.id}`}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={excludedFromBudget}
                  type="checkbox"
                  onChange={(event) => setExcludedFromBudget(event.target.checked)}
                />
                Exclude from budget
              </label>
            </div>
            <div className="grid gap-3 rounded-2xl border bg-background/60 p-4 text-sm md:grid-cols-2 xl:grid-cols-3">
              <Fact label="Account" value={transaction.accountName} />
              <Fact label="Source" value={transaction.source.replace("_", " ")} />
              <Fact label="Parser" value={transaction.parserSource ?? "Not parsed"} />
              <Fact
                label="Transaction type"
                value={transaction.transactionType ?? "Unknown"}
              />
              <Fact
                label="Payment channel"
                value={transaction.paymentChannel ?? "Unknown"}
              />
              <Fact
                label="Original currency"
                value={
                  transaction.originalAmount && transaction.originalCurrency
                    ? formatMoney(
                        Number(transaction.originalAmount),
                        transaction.originalCurrency,
                      )
                    : "N/A"
                }
              />
              {providerDescription ? (
                <div className="md:col-span-2 xl:col-span-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Bank description
                  </p>
                  <p className="mt-1 text-muted-foreground">{providerDescription}</p>
                </div>
              ) : null}
              {originalMerchant ? (
                <Fact label="Original merchant" value={originalMerchant} />
              ) : null}
              <p className="md:col-span-2 xl:col-span-3 text-xs text-muted-foreground">
                Category and merchant corrections train future matches for this
                household. Bank-owned amount, date, account and currency stay
                locked for synced rows.
              </p>
            </div>
            <div className="flex gap-2">
              <Button disabled={saving} type="button" onClick={() => void save()}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save
              </Button>
              <Button
                disabled={saving}
                type="button"
                variant="outline"
                onClick={() => setEditing(false)}
              >
                <X className="size-4" />
                Cancel
              </Button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b transition-colors hover:bg-secondary/30">
      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
        {transaction.date}
      </td>
      <td className="min-w-72 px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <ClassificationIndicator
            confidence={transaction.categoryConfidence}
            source={transaction.categorySource}
            state={classificationState}
          />
          <TransferLinkBadge summary={transaction.transferSummary} />
          {isOneSidedTransfer ? (
            <Badge className="gap-1 border-sky-500/30 bg-sky-500/10 text-sky-700">
              One-sided transfer
            </Badge>
          ) : null}
          {transaction.recurringBill ? (
            <Badge className="gap-1 border-purple-500/30 bg-purple-500/10 text-purple-700">
              <Repeat className="size-3.5" />
              {transaction.recurringBill.billName}
            </Badge>
          ) : null}
        </div>
        <p className="font-medium">{transaction.merchantName ?? transaction.description}</p>
        {transaction.merchantName ? (
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {transaction.description}
          </p>
        ) : null}
        {hasSuggestion ? (
          <div className="mt-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
            <p className="font-medium text-amber-700">
              Suggested: {transaction.suggestedCategoryName ?? "Unknown category"}
            </p>
            {transaction.suggestedMerchantName &&
            transaction.suggestedMerchantName !== transaction.merchantName ? (
              <p className="text-muted-foreground">
                Merchant -&gt; {transaction.suggestedMerchantName}
              </p>
            ) : null}
            {transaction.suggestedDescription &&
            transaction.suggestedDescription !== transaction.description ? (
              <p className="line-clamp-1 text-muted-foreground">
                Description -&gt; {transaction.suggestedDescription}
              </p>
            ) : null}
          </div>
        ) : null}
        {transaction.notes ? (
          <p className="line-clamp-1 text-xs text-muted-foreground">
            Note: {transaction.notes}
          </p>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
        {transaction.accountName}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
        {transaction.categoryName ??
          transaction.suggestedCategoryName ??
          "Uncategorized"}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <Badge>{transaction.status}</Badge>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
        {formatMoney(Number(transaction.amount), transaction.currency)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <div className="flex flex-wrap justify-end gap-2">
          {hasSuggestion ? (
            <SuggestionActions transactionId={transaction.id} />
          ) : null}
          {undoAvailable ? (
            <AutoLabelUndoButton transactionId={transaction.id} />
          ) : null}
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() => setEditing(true)}
          >
            <Edit3 className="size-4" />
            Edit
          </Button>
        </div>
      </td>
    </tr>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 capitalize text-muted-foreground">{value}</p>
    </div>
  );
}
