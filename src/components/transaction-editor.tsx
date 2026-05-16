"use client";

import {
  Ban,
  Clock,
  Edit3,
  Loader2,
  PieChart,
  Repeat,
  Save,
  Unlink,
  X,
} from "lucide-react";
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
import { cn, formatMoney } from "@/lib/utils";

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
  const [savingCategory, setSavingCategory] = useState(false);
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

  async function saveCategoryPick(nextValue: string) {
    const nextCategoryId =
      nextValue === "__uncategorized__" ? null : nextValue;
    const currentCategoryId = transaction.categoryId ?? null;
    if (nextCategoryId === currentCategoryId) {
      return;
    }

    setSavingCategory(true);
    try {
      const response = await fetch(`/api/transactions/${transaction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: nextCategoryId }),
      });
      await parseApiResponse(response);
      toast.success("Transaction updated");
      router.refresh();
    } catch (error) {
      showErrorToast("Could not update transaction", error);
    } finally {
      setSavingCategory(false);
    }
  }

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
        <td colSpan={6} className="p-4">
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

  const recurringBillTitle = transaction.recurringBill
    ? [
        `Recurring bill: ${transaction.recurringBill.billName}`,
        `Cadence: ${transaction.recurringBill.cadence.replace(/_/g, " ")}`,
        transaction.recurringBill.nextDueDate
          ? `Next due: ${transaction.recurringBill.nextDueDate}`
          : null,
        transaction.recurringBill.isPossiblyCancelled
          ? "Marked as possibly cancelled."
          : null,
      ]
        .filter(Boolean)
        .join(". ")
    : "";
  const oneSidedTitle =
    "One-sided transfer: internal movement excluded from budget matching.";

  const assignedCategoryName = transaction.categoryId
    ? categories.find((c) => c.id === transaction.categoryId)?.name
    : undefined;
  const categoryTriggerLabel =
    assignedCategoryName ??
    (!transaction.categoryId && hasSuggestion
      ? `Suggested: ${transaction.suggestedCategoryName ?? "Unknown"}`
      : "Uncategorized");

  return (
    <tr
      className={cn(
        "border-b transition-colors hover:bg-secondary/30",
        transaction.status === "pending" &&
          "border-l-[3px] border-l-amber-500 bg-amber-500/[0.06]",
        transaction.status === "excluded" &&
          "border-l-[3px] border-l-zinc-500/80 bg-muted/40",
      )}
    >
      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
        {transaction.date}
      </td>
      <td className="min-w-72 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {transaction.merchantName ?? transaction.description}
            </p>
            {transaction.merchantName ? (
              <p className="line-clamp-1 text-xs text-muted-foreground">
                {transaction.description}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-nowrap items-center gap-1">
            <ClassificationIndicator
              confidence={transaction.categoryConfidence}
              source={transaction.categorySource}
              state={classificationState}
              variant="icon"
            />
            <TransferLinkBadge
              summary={transaction.transferSummary}
              variant="icon"
            />
            {isOneSidedTransfer ? (
              <span
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-700"
                title={oneSidedTitle}
              >
                <span className="sr-only">{oneSidedTitle}</span>
                <Unlink className="size-3.5" aria-hidden />
              </span>
            ) : null}
            {transaction.recurringBill ? (
              <span
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-700"
                title={recurringBillTitle}
              >
                <span className="sr-only">{recurringBillTitle}</span>
                <Repeat className="size-3.5" aria-hidden />
              </span>
            ) : null}
            {transaction.status === "pending" ? (
              <span
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/15 text-amber-800"
                title="Pending: this transaction is not yet posted."
              >
                <span className="sr-only">Pending transaction</span>
                <Clock className="size-3.5" aria-hidden />
              </span>
            ) : null}
            {transaction.status === "excluded" ? (
              <span
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-zinc-500/40 bg-muted text-muted-foreground"
                title="Excluded: removed from active budgeting and reporting flows."
              >
                <span className="sr-only">Excluded transaction</span>
                <Ban className="size-3.5" aria-hidden />
              </span>
            ) : null}
            {transaction.status === "posted" && transaction.excludedFromBudget ? (
              <span
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-orange-500/35 bg-orange-500/10 text-orange-800"
                title="Excluded from budget: not counted toward budget totals."
              >
                <span className="sr-only">Excluded from budget</span>
                <PieChart className="size-3.5" aria-hidden />
              </span>
            ) : null}
          </div>
        </div>
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
      <td className="max-w-[14rem] px-4 py-3 text-sm">
        <Select
          disabled={savingCategory}
          value={transaction.categoryId ?? "__uncategorized__"}
          onValueChange={(value) => void saveCategoryPick(value)}
        >
          <SelectTrigger
            id={`transaction-category-inline-${transaction.id}`}
            aria-label={`Category: ${categoryTriggerLabel}`}
            className={cn(
              "h-auto min-h-0 w-full max-w-[14rem] gap-1 border-0 bg-transparent px-1.5 py-1 shadow-none",
              "font-normal text-muted-foreground transition-colors",
              "hover:bg-muted/50 hover:text-foreground",
              "rounded-lg focus:ring-1 focus:ring-ring",
              "[&>svg:last-child]:size-3.5 [&>svg:last-child]:opacity-40",
            )}
            title="Click to change category"
          >
            <span className="line-clamp-2 flex-1 text-left text-sm">
              {categoryTriggerLabel}
            </span>
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="__uncategorized__">Uncategorized</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
        {formatMoney(Number(transaction.amount), transaction.currency)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <div className="inline-flex flex-nowrap items-center justify-end gap-1">
          {hasSuggestion ? (
            <SuggestionActions iconOnly transactionId={transaction.id} />
          ) : null}
          {undoAvailable ? (
            <AutoLabelUndoButton iconOnly transactionId={transaction.id} />
          ) : null}
          <Button
            aria-label="Edit transaction"
            className="size-8 shrink-0 p-0"
            size="sm"
            title="Edit transaction"
            type="button"
            variant="outline"
            onClick={() => {
              setCategoryId(transaction.categoryId ?? "");
              setEditing(true);
            }}
          >
            <Edit3 className="size-4" />
            <span className="sr-only">Edit transaction</span>
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
