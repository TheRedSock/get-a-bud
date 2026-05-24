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
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { LinkTransactionToBillDialog } from "@/components/bills/bill-linking-dialogs";
import { AutoLabelUndoButton } from "@/components/auto-label-undo-button";
import { useRegisterFrozenRow } from "@/components/pipeline/use-register-frozen-row";
import { ClassificationIndicator } from "@/components/classification-indicator";
import { SuggestionActions } from "@/components/suggestion-actions";
import { FormField, formFieldDescribedBy } from "@/components/forms/form-field";
import { MoneyField } from "@/components/forms/money-field";
import { TransferLinkBadge } from "@/components/transfer-link-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateTransaction } from "@/app/(app)/transactions/actions";
import { unwrapAction } from "@/lib/actions/client";
import type { ClassificationUiState } from "@/lib/classification/ui-state";
import { showErrorToast } from "@/lib/toast-errors";
import { cn } from "@/lib/utils";
import { centsToDecimalString, formatCents } from "@/lib/finance/money";
import type { TransferSummary } from "@/lib/finance/transactions";
import {
  toUpdateTransactionPayload,
  transactionEditorFormSchema,
} from "@/lib/finance/validation";

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
    amountCents: number;
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
    originalAmountCents: number | null;
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
    classificationState: ClassificationUiState;
    undoAutoLabelAvailable: boolean;
    canEditAmount: boolean;
    canEditDate: boolean;
  };
};

export function TransactionEditor({
  categories,
  transaction,
  rowClassName,
}: TransactionEditorProps & { rowClassName?: string }) {
  const router = useRouter();
  const frozenRow = useRegisterFrozenRow();
  const { canEditAmount, canEditDate, classificationState, undoAutoLabelAvailable } =
    transaction;
  const [editing, setEditing] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);

  useEffect(() => {
    if (editing) {
      frozenRow.register?.(transaction.id);
      return () => frozenRow.unregister?.(transaction.id);
    }
    return undefined;
  }, [editing, transaction.id, frozenRow]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(transactionEditorFormSchema),
    mode: "onBlur",
    defaultValues: {
      description: transaction.description,
      merchantName: transaction.merchantName ?? "",
      notes: transaction.notes ?? "",
      categoryId: transaction.categoryId ?? "",
      status: transaction.status,
      excludedFromBudget: transaction.excludedFromBudget,
      amountCents: centsToDecimalString(transaction.amountCents),
      date: transaction.date,
    },
  });

  const editCategoryId = watch("categoryId");
  const editStatus = watch("status");
  const excludedFromBudget = watch("excludedFromBudget");

  function openEditor() {
    reset({
      description: transaction.description,
      merchantName: transaction.merchantName ?? "",
      notes: transaction.notes ?? "",
      categoryId: transaction.categoryId ?? "",
      status: transaction.status,
      excludedFromBudget: transaction.excludedFromBudget,
      amountCents: centsToDecimalString(transaction.amountCents),
      date: transaction.date,
    });
    setEditing(true);
  }
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
      await unwrapAction(
        updateTransaction({
          transactionId: transaction.id,
          data: { categoryId: nextCategoryId },
        }),
        "Could not update transaction",
      );
      toast.success("Transaction updated");
      router.refresh();
    } catch (error) {
      showErrorToast("Could not update transaction", error);
    } finally {
      setSavingCategory(false);
    }
  }

  const save = handleSubmit(async (values) => {
    try {
      const data = toUpdateTransactionPayload(values, {
        includeAmount: canEditAmount,
        includeDate: canEditDate,
      });

      await unwrapAction(
        updateTransaction({
          transactionId: transaction.id,
          data,
        }),
        "Could not update transaction",
      );
      toast.success("Transaction updated");
      setEditing(false);
      router.refresh();
    } catch (error) {
      showErrorToast("Could not update transaction", error);
    }
  });

  if (editing) {
    // Rendered inside a <tr> — cannot wrap in a <form> element (invalid HTML).
    // Validation is handled via RHF's handleSubmit invoked from the save button.
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
                <Badge className="border-info/30 bg-info/10 text-info">
                  One-sided transfer
                </Badge>
              ) : null}
              {transaction.recurringBill ? (
                <Badge className="gap-1 border-accent/30 bg-accent/10 text-accent-foreground">
                  <Repeat className="size-3.5" aria-hidden />
                  {transaction.recurringBill.billName}
                </Badge>
              ) : null}
            </div>
            {hasSuggestion ? (
              <div className="grid gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4">
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
              <FormField
                id={`transaction-description-${transaction.id}`}
                label="Description"
                error={errors.description?.message}
                className="sm:col-span-2"
              >
                <Input
                  id={`transaction-description-${transaction.id}`}
                  aria-invalid={Boolean(errors.description)}
                  aria-describedby={formFieldDescribedBy(
                    `transaction-description-${transaction.id}`,
                    Boolean(errors.description),
                  )}
                  className={cn(errors.description && "border-destructive")}
                  {...register("description")}
                />
                {!canEditAmount ? (
                  <p className="text-xs text-muted-foreground">
                    The original bank label is kept in metadata for future import
                    learning.
                  </p>
                ) : null}
              </FormField>
              <FormField
                id={`transaction-merchant-${transaction.id}`}
                label="Merchant"
                error={errors.merchantName?.message}
              >
                <Input
                  id={`transaction-merchant-${transaction.id}`}
                  aria-invalid={Boolean(errors.merchantName)}
                  aria-describedby={formFieldDescribedBy(
                    `transaction-merchant-${transaction.id}`,
                    Boolean(errors.merchantName),
                  )}
                  className={cn(errors.merchantName && "border-destructive")}
                  {...register("merchantName")}
                />
              </FormField>
              <FormField
                id={`transaction-category-${transaction.id}`}
                label="Category"
                error={errors.categoryId?.message}
              >
                <Select
                  value={editCategoryId || "__uncategorized__"}
                  onValueChange={(value) =>
                    setValue("categoryId", value === "__uncategorized__" ? "" : value)
                  }
                >
                  <SelectTrigger
                    id={`transaction-category-${transaction.id}`}
                    className={cn(errors.categoryId && "border-destructive")}
                  >
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
              </FormField>
              <FormField
                id={`transaction-status-${transaction.id}`}
                label="Status"
                error={errors.status?.message}
              >
                <Select
                  value={editStatus}
                  onValueChange={(value) =>
                    setValue("status", value as TransactionStatus)
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
              </FormField>
              <FormField
                id={`transaction-date-${transaction.id}`}
                label="Date"
                error={errors.date?.message}
              >
                <Input
                  id={`transaction-date-${transaction.id}`}
                  disabled={!canEditDate}
                  type="date"
                  aria-invalid={Boolean(errors.date)}
                  aria-describedby={formFieldDescribedBy(
                    `transaction-date-${transaction.id}`,
                    Boolean(errors.date),
                  )}
                  className={cn(errors.date && "border-destructive")}
                  {...register("date")}
                />
              </FormField>
              <MoneyField
                id={`transaction-amount-${transaction.id}`}
                label="Amount"
                name="amountCents"
                register={register}
                disabled={!canEditAmount}
                error={errors.amountCents?.message}
                onBlurNormalize={(value) =>
                  setValue("amountCents", value, { shouldValidate: true })
                }
              />
              <FormField
                id={`transaction-notes-${transaction.id}`}
                label="Notes"
                error={errors.notes?.message}
              >
                <Input
                  id={`transaction-notes-${transaction.id}`}
                  aria-invalid={Boolean(errors.notes)}
                  aria-describedby={formFieldDescribedBy(
                    `transaction-notes-${transaction.id}`,
                    Boolean(errors.notes),
                  )}
                  className={cn(errors.notes && "border-destructive")}
                  {...register("notes")}
                />
              </FormField>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  {...register("excludedFromBudget")}
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
                  transaction.originalAmountCents && transaction.originalCurrency
                    ? formatCents(
                        transaction.originalAmountCents,
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
              <Button disabled={isSubmitting} type="button" onClick={() => void save()}>
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="size-4" aria-hidden />
                )}
                Save
              </Button>
              <Button
                disabled={isSubmitting}
                type="button"
                variant="outline"
                onClick={() => setEditing(false)}
              >
                <X className="size-4" aria-hidden />
                Cancel
              </Button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  const canLinkToBill =
    transaction.amountCents < 0 &&
    !transaction.recurringBill &&
    !transaction.excludedFromBudget &&
    !isOneSidedTransfer;
  const linkTransactionLabel =
    transaction.merchantName ?? transaction.description;

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
        rowClassName,
        transaction.status === "pending" &&
          "border-l-[3px] border-l-warning bg-warning/[0.06]",
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
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-info/30 bg-info/10 text-info"
                title={oneSidedTitle}
              >
                <span className="sr-only">{oneSidedTitle}</span>
                <Unlink className="size-3.5" aria-hidden />
              </span>
            ) : null}
            {transaction.recurringBill ? (
              <span
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent-foreground"
                title={recurringBillTitle}
              >
                <span className="sr-only">{recurringBillTitle}</span>
                <Repeat className="size-3.5" aria-hidden />
              </span>
            ) : null}
            {transaction.status === "pending" ? (
              <span
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-warning/40 bg-warning/15 text-warning-foreground"
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
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-info/35 bg-info/10 text-info"
                title="Excluded from budget: not counted toward budget totals."
              >
                <span className="sr-only">Excluded from budget</span>
                <PieChart className="size-3.5" aria-hidden />
              </span>
            ) : null}
          </div>
        </div>
        {hasSuggestion ? (
          <div className="mt-2 rounded-2xl border border-warning/30 bg-warning/10 p-3 text-xs">
            <p className="font-medium text-warning-foreground">
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
        {formatCents(transaction.amountCents, transaction.currency)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <div className="inline-flex flex-nowrap items-center justify-end gap-1">
          {hasSuggestion ? (
            <SuggestionActions iconOnly transactionId={transaction.id} />
          ) : null}
          {undoAutoLabelAvailable ? (
            <AutoLabelUndoButton iconOnly transactionId={transaction.id} />
          ) : null}
          {canLinkToBill ? (
            <LinkTransactionToBillDialog
              transactionId={transaction.id}
              transactionLabel={linkTransactionLabel}
            />
          ) : null}
          <Button
            aria-label="Edit transaction"
            className="size-8 shrink-0 p-0"
            size="sm"
            title="Edit transaction"
            type="button"
            variant="outline"
            onClick={openEditor}
          >
            <Edit3 className="size-4" aria-hidden />
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
