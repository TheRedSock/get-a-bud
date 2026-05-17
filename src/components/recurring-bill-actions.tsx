"use client";

import { Eye, Loader2, Pencil, Play, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

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
import { showErrorToast } from "@/lib/toast-errors";
import { formatCents } from "@/lib/finance/money";

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
  const [loading, setLoading] = useState(false);

  async function runDetection() {
    setLoading(true);

    try {
      const response = await fetch("/api/bills/detect", { method: "POST" });
      await parseApiResponse(response);
      toast.success("Recurring detection queued");
      router.refresh();
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
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Play className="size-4" />
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
      const response = await fetch(`/api/bills/${billId}/category`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: categoryId === NO_CATEGORY ? null : categoryId,
          applyToTransactions: true,
        }),
      });
      const body = await parseApiResponse<{ applied: number }>(response);
      toast.success(
        `Bill category saved${
          body.applied > 0
            ? ` and applied to ${body.applied} transaction${body.applied === 1 ? "" : "s"}`
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
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Save className="size-4" />
        )}
        Apply to matches
      </Button>
    </div>
  );
}

export function RecurringBillEditor({
  billId,
  cadence,
  expectedAmount,
  isActive,
  isPossiblyCancelled,
  name,
  nextDueDate,
}: {
  billId: string;
  cadence: string;
  expectedAmount: string | null;
  isActive: boolean;
  isPossiblyCancelled: boolean;
  name: string;
  nextDueDate: string | null;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name,
    cadence,
    expectedAmount: expectedAmount ?? "",
    nextDueDate: nextDueDate ?? "",
    isActive,
    isPossiblyCancelled,
  });

  async function saveBill() {
    setSaving(true);

    try {
      const response = await fetch(`/api/bills/${billId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          cadence: form.cadence,
          expectedAmount: form.expectedAmount
            ? Number(form.expectedAmount)
            : null,
          nextDueDate: form.nextDueDate || null,
          isActive: form.isActive,
          isPossiblyCancelled: form.isPossiblyCancelled,
        }),
      });
      await parseApiResponse(response);
      toast.success("Bill details saved");
      setExpanded(false);
      router.refresh();
    } catch (error) {
      showErrorToast("Could not update bill details", error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3">
      <Button
        size="sm"
        type="button"
        variant="ghost"
        onClick={() => setExpanded((value) => !value)}
      >
        <Pencil className="size-4" />
        {expanded ? "Close details" : "Edit details"}
      </Button>

      {expanded ? (
        <div className="mt-3 grid gap-3 rounded-2xl border bg-card/50 p-4">
          <div className="grid gap-2">
            <Label htmlFor={`bill-name-${billId}`}>Name</Label>
            <Input
              id={`bill-name-${billId}`}
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Cadence</Label>
              <Select
                value={form.cadence}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, cadence: value }))
                }
              >
                <SelectTrigger>
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
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`bill-amount-${billId}`}>Expected amount</Label>
              <Input
                id={`bill-amount-${billId}`}
                inputMode="decimal"
                value={form.expectedAmount}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    expectedAmount: event.target.value,
                  }))
                }
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`bill-due-${billId}`}>Next due date</Label>
              <Input
                id={`bill-due-${billId}`}
                type="date"
                value={form.nextDueDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    nextDueDate: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              type="button"
              variant={form.isActive ? "default" : "outline"}
              onClick={() =>
                setForm((current) => ({ ...current, isActive: true }))
              }
            >
              Active
            </Button>
            <Button
              size="sm"
              type="button"
              variant={!form.isActive ? "default" : "outline"}
              onClick={() =>
                setForm((current) => ({ ...current, isActive: false }))
              }
            >
              Ended
            </Button>
            <Button
              size="sm"
              type="button"
              variant={form.isPossiblyCancelled ? "default" : "outline"}
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  isPossiblyCancelled: !current.isPossiblyCancelled,
                }))
              }
            >
              Needs status check
            </Button>
          </div>

          <Button
            disabled={saving}
            size="sm"
            type="button"
            onClick={() => void saveBill()}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save bill
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function RejectRecurringBillButton({ billId }: { billId: string }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);

  async function rejectBill() {
    const confirmed = window.confirm(
      "Reject this recurring bill? It will be removed and its matched transactions will be ignored by future recurring detection.",
    );
    if (!confirmed) return;

    setRejecting(true);

    try {
      const response = await fetch(`/api/bills/${billId}`, {
        method: "DELETE",
      });
      const body = await parseApiResponse<{ ignoredTransactions: number }>(
        response,
      );
      toast.success(
        `Recurring bill rejected${
          body.ignoredTransactions > 0
            ? ` and ${body.ignoredTransactions} matched transaction${
                body.ignoredTransactions === 1 ? " was" : "s were"
              } ignored`
            : ""
        }`,
      );
      router.refresh();
    } catch (error) {
      showErrorToast("Could not reject recurring bill", error);
    } finally {
      setRejecting(false);
    }
  }

  return (
    <Button
      disabled={rejecting}
      size="sm"
      type="button"
      variant="destructive"
      onClick={() => void rejectBill()}
    >
      {rejecting ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Trash2 className="size-4" />
      )}
      Reject recurring bill
    </Button>
  );
}

export function BillTransactionsViewer({ billId }: { billId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<BillTransactionRow[] | null>(null);
  const [pattern, setPattern] = useState<{
    cadence: string;
    pattern: string | null;
    typicalDayOfMonth: number | null;
    merchantPattern: string;
    amountSignature: string;
  } | null>(null);

  async function toggle() {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);

    if (!nextExpanded || rows) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/bills/${billId}/transactions`);
      const body = await parseApiResponse<{
        pattern: NonNullable<typeof pattern>;
        transactions: BillTransactionRow[];
      }>(response);
      setPattern(body.pattern);
      setRows(body.transactions);
    } catch (error) {
      showErrorToast("Could not load matching transactions", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <Button size="sm" type="button" variant="outline" onClick={() => void toggle()}>
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Eye className="size-4" />
        )}
        {expanded ? "Hide matches" : "Show matches"}
      </Button>

      {expanded ? (
        <div className="mt-3 grid gap-3 rounded-2xl border bg-card/50 p-4">
          {pattern ? (
            <p className="text-xs text-muted-foreground">
              Pattern: {pattern.cadence.replace("_", " ")}
              {pattern.typicalDayOfMonth
                ? ` around day ${pattern.typicalDayOfMonth}`
                : ""}
              {" · "}
              Merchant key: {pattern.merchantPattern}
              {pattern.amountSignature ? ` · ${pattern.amountSignature}` : ""}
            </p>
          ) : null}

          {rows?.length ? (
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
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Loading matches...</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No matched transactions are stored for this bill yet.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
