"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, Loader2, Pencil, Play, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { LinkTransactionForBillDialog } from "@/components/bills/bill-linking-dialogs";
import { DestructiveConfirmDialog } from "@/components/feedback/destructive-confirm-dialog";
import { usePipelineLiveOptional } from "@/components/pipeline/pipeline-live-context";
import { FormField, formFieldDescribedBy } from "@/components/forms/form-field";
import { MoneyField } from "@/components/forms/money-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  detectRecurringBills,
  getBillTransactions,
  rejectBill,
  updateBill,
  updateBillCategory,
} from "@/app/(app)/bills/actions";
import { unwrapAction } from "@/lib/actions/client";
import { formatBillPatternSummary } from "@/lib/finance/bills/display";
import { formatCents } from "@/lib/finance/money";
import {
  updateBillFormSchema,
  updateBillSchema,
} from "@/lib/finance/validation";
import { showErrorToast } from "@/lib/toast-errors";
import { cn } from "@/lib/utils";

const NO_CATEGORY = "__none";

export type BillCategoryOption = {
  id: string;
  name: string;
};

const cadenceOptions = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "semi_annual",
  "yearly",
  "unknown",
] as const;

type BillTransactionRow = {
  historyId: string;
  amountCents: number;
  originalAmountCents: number | null;
  originalCurrency: string | null;
  date: string;
  transactionId: string | null;
  description: string | null;
  merchantName: string | null;
  currency: string | null;
  transactionAmountCents: number | null;
  excludedFromBudget: boolean | null;
  transactionType: string | null;
  accountName: string | null;
};

export function RunRecurringDetectionButton() {
  const router = useRouter();
  const pipeline = usePipelineLiveOptional();
  const [loading, setLoading] = useState(false);

  async function runDetection() {
    setLoading(true);

    try {
      const result = await unwrapAction(
        detectRecurringBills({ replayUnapproved: true }),
        "Could not queue recurring detection",
      );
      if (result.pipelineRunId) {
        pipeline?.trackPipelineRunId(result.pipelineRunId);
      } else {
        void pipeline?.refreshRuns();
      }
      toast.success(
        "Recurring detection queued — pending bills will be rescanned.",
      );
    } catch (error) {
      showErrorToast("Could not queue recurring detection", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      disabled={loading}
      type="button"
      variant="outline"
      onClick={() => void runDetection()}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Play className="size-4" aria-hidden />
      )}
      Run recurring detection
    </Button>
  );
}

export function RecurringBillCategoryAction({
  billId,
  categories,
  initialCategoryId,
}: {
  billId: string;
  categories: BillCategoryOption[];
  initialCategoryId: string | null;
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(initialCategoryId ?? NO_CATEGORY);
  const [saving, setSaving] = useState(false);

  async function saveCategory() {
    setSaving(true);

    try {
      const { applied } = await unwrapAction(
        updateBillCategory({
          billId,
          data: {
            categoryId: categoryId === NO_CATEGORY ? null : categoryId,
            applyToTransactions: true,
          },
        }),
        "Could not update bill category",
      );
      toast.success(
        `Bill category saved${
          applied > 0
            ? ` and applied to ${applied} transaction${applied === 1 ? "" : "s"}`
            : ""
        }`,
      );
      router.refresh();
    } catch (error) {
      showErrorToast("Could not update bill category", error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Select value={categoryId} onValueChange={setCategoryId}>
        <SelectTrigger className="h-9 min-w-44">
          <SelectValue placeholder="Choose category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_CATEGORY}>No category</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        disabled={saving || categoryId === NO_CATEGORY}
        size="sm"
        type="button"
        variant="outline"
        onClick={() => void saveCategory()}
      >
        {saving ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Save className="size-4" aria-hidden />
        )}
        Apply to matches
      </Button>
    </div>
  );
}

type UpdateBillFormValues = z.input<typeof updateBillFormSchema>;

export function RecurringBillEditor({
  billId,
  cadence,
  expectedAmount,
  isActive,
  isPossiblyCancelled,
  name,
  nextDueDate,
  embedded = false,
  showEndToggle = true,
  onSaved,
}: {
  billId: string;
  cadence: string;
  expectedAmount: string | null;
  isActive: boolean;
  isPossiblyCancelled: boolean;
  name: string;
  nextDueDate: string | null;
  embedded?: boolean;
  showEndToggle?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(embedded);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UpdateBillFormValues>({
    resolver: zodResolver(updateBillFormSchema),
    mode: "onBlur",
    defaultValues: {
      name,
      cadence: cadence as UpdateBillFormValues["cadence"],
      expectedAmountCents: expectedAmount ?? "",
      nextDueDate: nextDueDate ?? "",
      isActive,
      isPossiblyCancelled,
    },
  });

  const formCadence = watch("cadence");
  const formIsActive = watch("isActive");
  const formNeedsCheck = watch("isPossiblyCancelled");

  function toggleExpanded() {
    setExpanded((value) => {
      const next = !value;
      if (next) {
        reset({
          name,
          cadence: cadence as UpdateBillFormValues["cadence"],
          expectedAmountCents: expectedAmount ?? "",
          nextDueDate: nextDueDate ?? "",
          isActive,
          isPossiblyCancelled,
        });
      }
      return next;
    });
  }

  const saveBill = handleSubmit(async (values) => {
    try {
      const data = updateBillSchema.parse({
        name: values.name,
        cadence: values.cadence,
        expectedAmountCents: values.expectedAmountCents?.trim() || null,
        nextDueDate: values.nextDueDate?.trim() || null,
        isActive: values.isActive,
        isPossiblyCancelled: values.isPossiblyCancelled,
      });

      await unwrapAction(
        updateBill({ billId, data }),
        "Could not update bill details",
      );
      toast.success("Bill details saved");
      if (!embedded) setExpanded(false);
      onSaved?.();
      router.refresh();
    } catch (error) {
      showErrorToast("Could not update bill details", error);
    }
  });

  return (
    <div className={embedded ? undefined : "mt-3"}>
      {embedded ? null : (
        <Button size="sm" type="button" variant="ghost" onClick={toggleExpanded}>
          <Pencil className="size-4" aria-hidden />
          {expanded ? "Close details" : "Edit details"}
        </Button>
      )}

      {expanded ? (
        <form
          className={cn(
            "grid gap-3",
            embedded ? undefined : "mt-3 rounded-2xl border bg-card/50 p-4",
          )}
          noValidate
          onSubmit={saveBill}
        >
          <FormField
            id={`bill-name-${billId}`}
            label="Name"
            error={errors.name?.message}
          >
            <Input
              id={`bill-name-${billId}`}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={formFieldDescribedBy(
                `bill-name-${billId}`,
                Boolean(errors.name),
              )}
              className={cn(errors.name && "border-destructive")}
              {...register("name")}
            />
          </FormField>

          <div className="grid gap-3 sm:grid-cols-3">
            <FormField id={`bill-cadence-${billId}`} label="Cadence" error={errors.cadence?.message}>
              <Select
                value={formCadence}
                onValueChange={(value) =>
                  setValue("cadence", value as UpdateBillFormValues["cadence"], {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger
                  id={`bill-cadence-${billId}`}
                  aria-invalid={Boolean(errors.cadence)}
                  aria-describedby={formFieldDescribedBy(
                    `bill-cadence-${billId}`,
                    Boolean(errors.cadence),
                  )}
                  className={cn(errors.cadence && "border-destructive")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cadenceOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <MoneyField
              id={`bill-amount-${billId}`}
              label="Expected amount"
              name="expectedAmountCents"
              register={register}
              error={errors.expectedAmountCents?.message}
              onBlurNormalize={(value) =>
                setValue("expectedAmountCents", value, { shouldValidate: true })
              }
            />

            <FormField
              id={`bill-due-${billId}`}
              label="Next due date"
              error={errors.nextDueDate?.message}
            >
              <Input
                id={`bill-due-${billId}`}
                type="date"
                aria-invalid={Boolean(errors.nextDueDate)}
                aria-describedby={formFieldDescribedBy(
                  `bill-due-${billId}`,
                  Boolean(errors.nextDueDate),
                )}
                className={cn(errors.nextDueDate && "border-destructive")}
                {...register("nextDueDate")}
              />
            </FormField>
          </div>

          {showEndToggle ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                type="button"
                variant={formIsActive ? "default" : "outline"}
                onClick={() => setValue("isActive", true)}
              >
                Active
              </Button>
              <Button
                size="sm"
                type="button"
                variant={!formIsActive ? "default" : "outline"}
                onClick={() => setValue("isActive", false)}
              >
                Ended
              </Button>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              type="button"
              variant={formNeedsCheck ? "default" : "outline"}
              onClick={() =>
                setValue("isPossiblyCancelled", !formNeedsCheck)
              }
            >
              Possibly cancelled
            </Button>
          </div>

          <Button disabled={isSubmitting} size="sm" type="submit">
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            Save bill
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export function RejectRecurringBillButton({ billId }: { billId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setConfirmError(null);
    }
  }

  async function handleRejectBill() {
    setRejecting(true);
    setConfirmError(null);

    try {
      const result = await rejectBill({ billId });
      if (result.error) {
        setConfirmError(
          "We could not reject this bill. Your data is safe — please try again.",
        );
        return;
      }

      const { ignoredTransactions } = result.data;
      toast.success(
        `Recurring bill rejected${
          ignoredTransactions > 0
            ? ` and ${ignoredTransactions} matched transaction${
                ignoredTransactions === 1 ? " was" : "s were"
              } ignored`
            : ""
        }`,
      );
      handleOpenChange(false);
      router.refresh();
    } catch {
      setConfirmError(
        "We could not reject this bill. Your data is safe — please try again.",
      );
    } finally {
      setRejecting(false);
    }
  }

  return (
    <DestructiveConfirmDialog
      confirmLabel="Reject bill"
      description="Reject this recurring bill? It will be removed and its matched transactions will be ignored by future recurring detection."
      errorMessage={confirmError}
      open={open}
      pending={rejecting}
      title="Reject recurring bill?"
      trigger={
        <Button disabled={rejecting} size="sm" type="button" variant="destructive">
          <Trash2 className="size-4" aria-hidden />
          Reject recurring bill
        </Button>
      }
      onConfirm={handleRejectBill}
      onOpenChange={handleOpenChange}
    />
  );
}

type BillMatchesLoadState = "idle" | "loading" | "success" | "error";

export function BillTransactionsViewer({
  billId,
  embedded = false,
  loadOnMount = false,
  onLinked,
}: {
  billId: string;
  embedded?: boolean;
  /** When true, fetches matches once after mount (dialog use). */
  loadOnMount?: boolean;
  onLinked?: () => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(embedded);
  const [loadState, setLoadState] = useState<BillMatchesLoadState>("idle");
  const [rows, setRows] = useState<BillTransactionRow[]>([]);
  const [pattern, setPattern] = useState<{
    cadence: string;
    pattern: string | null;
    typicalDayOfMonth: number | null;
    merchantPattern: string;
    amountSignature: string;
  } | null>(null);

  const loadMatches = useCallback(async () => {
    setLoadState("loading");
    try {
      const body = await unwrapAction(
        getBillTransactions({ billId }),
        "Could not load matching transactions",
      );
      setPattern(body.pattern);
      setRows(body.transactions);
      setLoadState("success");
    } catch (error) {
      setLoadState("error");
      showErrorToast("Could not load matching transactions", error);
    }
  }, [billId]);

  useEffect(() => {
    if (!loadOnMount) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only fetch in dialog
    void loadMatches();
  }, [loadOnMount, loadMatches]);

  async function toggle() {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);

    if (!nextExpanded) return;
    if (loadState === "success") return;

    await loadMatches();
  }

  function handleLinked() {
    setLoadState("idle");
    void loadMatches();
    onLinked?.();
    router.refresh();
  }

  return (
    <div className={embedded ? undefined : "mt-3"}>
      {embedded ? null : (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" type="button" variant="outline" onClick={() => void toggle()}>
          {loadState === "loading" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
          {expanded ? "Hide matches" : "Show matches"}
        </Button>
        <LinkTransactionForBillDialog billId={billId} onLinked={handleLinked} />
      </div>
      )}

      {expanded ? (
        <div className="mt-3 grid gap-3 rounded-2xl border bg-card/50 p-4">
          {pattern?.amountSignature ? (
            <p className="text-xs text-muted-foreground">
              Pattern:{" "}
              {formatBillPatternSummary({
                cadence: pattern.cadence,
                typicalDayOfMonth: pattern.typicalDayOfMonth,
                amountSignature: pattern.amountSignature,
              })}
            </p>
          ) : null}

          {loadState === "loading" ? (
            <p className="text-sm text-muted-foreground">Loading matches...</p>
          ) : loadState === "error" ? (
            <div className="grid gap-2">
              <p className="text-sm text-destructive" role="alert">
                Could not load matching transactions. Please try again.
              </p>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => void loadMatches()}
              >
                Try again
              </Button>
            </div>
          ) : rows.length ? (
            <div className="grid gap-2">
              {rows.map((row) => (
                <div
                  key={row.historyId}
                  className="rounded-xl border bg-background/60 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {row.description ?? row.merchantName ?? "Transaction"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.date}
                        {row.accountName ? ` · ${row.accountName}` : ""}
                      </p>
                    </div>
                    <p className="font-semibold">
                      {row.originalCurrency && row.originalAmountCents
                        ? formatCents(
                            row.originalAmountCents,
                            row.originalCurrency,
                          )
                        : formatCents(
                            row.amountCents,
                            row.currency ?? undefined,
                          )}
                    </p>
                  </div>
                  {row.excludedFromBudget || row.transactionType ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {row.transactionType
                        ? `Type: ${row.transactionType}`
                        : null}
                      {row.excludedFromBudget ? " · Excluded from budget" : null}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : loadState === "success" ? (
            <p className="text-sm text-muted-foreground">
              No matched transactions are stored for this bill yet.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
