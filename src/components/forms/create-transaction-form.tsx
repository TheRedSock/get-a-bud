"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseApiResponse } from "@/lib/api-client";
import { showErrorToast } from "@/lib/toast-errors";

type CreateTransactionFormProps = {
  accounts: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function CreateTransactionForm({
  accounts,
  categories,
}: CreateTransactionFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [currency, setCurrency] = useState("NOK");
  const [date, setDate] = useState(todayString);
  const [merchantName, setMerchantName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const payload: {
        description: string;
        amount: number;
        accountId: string;
        currency: string;
        date: string;
        merchantName?: string;
        categoryId?: string;
        notes?: string;
      } = {
        description,
        amount: Number(amount),
        accountId,
        currency,
        date,
      };
      const trimmedMerchant = merchantName.trim();
      const trimmedNotes = notes.trim();

      if (trimmedMerchant) {
        payload.merchantName = trimmedMerchant;
      }
      if (categoryId) {
        payload.categoryId = categoryId;
      }
      if (trimmedNotes) {
        payload.notes = trimmedNotes;
      }

      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      await parseApiResponse(response);
      toast.success("Transaction created");
      setDescription("");
      setAmount("");
      setAccountId(accounts[0]?.id ?? "");
      setCurrency("NOK");
      setDate(todayString());
      setMerchantName("");
      setCategoryId("");
      setNotes("");
      router.refresh();
    } catch (error) {
      showErrorToast("Could not create transaction", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div className="grid gap-2">
        <Label htmlFor="transaction-description">Description</Label>
        <Input
          id="transaction-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="transaction-amount">Amount</Label>
        <Input
          id="transaction-amount"
          type="number"
          inputMode="decimal"
          step="any"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="transaction-account">Account</Label>
        <select
          id="transaction-account"
          className="h-11 rounded-2xl border bg-background/60 px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          required
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="transaction-currency">Currency</Label>
        <Input
          id="transaction-currency"
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          maxLength={3}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="transaction-date">Date</Label>
        <Input
          id="transaction-date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="transaction-merchant">Merchant</Label>
        <Input
          id="transaction-merchant"
          value={merchantName}
          onChange={(event) => setMerchantName(event.target.value)}
          placeholder="Optional"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="transaction-category">Category</Label>
        <select
          id="transaction-category"
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
        <Label htmlFor="transaction-notes">Notes</Label>
        <Input
          id="transaction-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional"
        />
      </div>
      <Button disabled={loading} type="submit">
        {loading ? "Creating..." : "Create transaction"}
      </Button>
    </form>
  );
}
