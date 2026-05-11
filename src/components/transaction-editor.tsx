"use client";

import { Edit3, Loader2, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseApiResponse } from "@/lib/api-client";
import { showErrorToast } from "@/lib/toast-errors";
import { formatMoney } from "@/lib/utils";

type TransactionStatus = "pending" | "posted" | "excluded";

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
    categoryId: string | null;
    status: TransactionStatus;
    excludedFromBudget: boolean;
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

  async function save() {
    setSaving(true);

    try {
      const payload: Record<string, unknown> = {
        merchantName: merchantName.trim() || null,
        notes: notes.trim() || null,
        categoryId: categoryId || null,
        status,
        excludedFromBudget,
      };

      if (isManual) {
        payload.description = description;
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
      <div className="grid gap-4 rounded-3xl border bg-background/40 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor={`transaction-description-${transaction.id}`}>
              Description
            </Label>
            <Input
              id={`transaction-description-${transaction.id}`}
              disabled={!isManual}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            {!isManual ? (
              <p className="text-xs text-muted-foreground">
                Bank descriptions stay unchanged; use merchant, category and notes
                for your own cleanup.
              </p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`transaction-merchant-${transaction.id}`}>Merchant</Label>
            <Input
              id={`transaction-merchant-${transaction.id}`}
              value={merchantName}
              onChange={(event) => setMerchantName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`transaction-category-${transaction.id}`}>Category</Label>
            <select
              id={`transaction-category-${transaction.id}`}
              className="h-11 rounded-2xl border bg-background/60 px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">Uncategorized</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`transaction-status-${transaction.id}`}>Status</Label>
            <select
              id={`transaction-status-${transaction.id}`}
              className="h-11 rounded-2xl border bg-background/60 px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={status}
              onChange={(event) => setStatus(event.target.value as TransactionStatus)}
            >
              <option value="posted">Posted</option>
              <option value="pending">Pending</option>
              <option value="excluded">Excluded</option>
            </select>
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
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={excludedFromBudget}
              type="checkbox"
              onChange={(event) => setExcludedFromBudget(event.target.checked)}
            />
            Exclude from budget
          </label>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor={`transaction-notes-${transaction.id}`}>Notes</Label>
            <Input
              id={`transaction-notes-${transaction.id}`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
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
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-3xl border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold">
          {transaction.merchantName ?? transaction.description}
        </p>
        <p className="text-sm text-muted-foreground">
          {transaction.date} · {transaction.source.replace("_", " ")}
        </p>
        {transaction.notes ? (
          <p className="mt-1 text-sm text-muted-foreground">{transaction.notes}</p>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <Badge>{transaction.status}</Badge>
        <p className="min-w-24 text-right font-semibold">
          {formatMoney(Number(transaction.amount), transaction.currency)}
        </p>
        <Button type="button" variant="outline" onClick={() => setEditing(true)}>
          <Edit3 className="size-4" />
          Edit
        </Button>
      </div>
    </div>
  );
}
