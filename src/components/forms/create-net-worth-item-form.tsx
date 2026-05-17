"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAsset, createLiability } from "@/app/(app)/net-worth/actions";
import { unwrapAction } from "@/lib/actions/client";
import { showErrorToast } from "@/lib/toast-errors";

type ItemType = "asset" | "liability";

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function CreateNetWorthItemForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemType, setItemType] = useState<ItemType>("asset");
  const [kind, setKind] = useState("property");
  const [currency, setCurrency] = useState("NOK");
  const [value, setValue] = useState("");
  const [valuationDate, setValuationDate] = useState(todayString);
  const [interestRate, setInterestRate] = useState("");
  const [minimumPayment, setMinimumPayment] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [notes, setNotes] = useState("");

  function handleTypeChange(newType: ItemType) {
    setItemType(newType);
    setKind(newType === "asset" ? "property" : "loan");
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const payload: Record<string, unknown> = {
      name: itemName,
      kind,
      currency,
    };
    const trimmedNotes = notes.trim();

    if (trimmedNotes) {
      payload.notes = trimmedNotes;
    }

    if (itemType === "asset") {
      payload.estimatedValue = Number(value);
      payload.valuationDate = valuationDate;
    } else {
      payload.currentBalance = Number(value);
      if (interestRate) {
        payload.interestRate = Number(interestRate);
      }
      if (minimumPayment) {
        payload.minimumPayment = Number(minimumPayment);
      }
      if (dueDay) {
        payload.dueDay = Number(dueDay);
      }
    }

    try {
      if (itemType === "asset") {
        await unwrapAction(createAsset(payload), "Could not create asset");
      } else {
        await unwrapAction(createLiability(payload), "Could not create liability");
      }
      toast.success(
        itemType === "asset" ? "Asset created" : "Liability created",
      );
      setItemName("");
      setItemType("asset");
      setKind("property");
      setCurrency("NOK");
      setValue("");
      setValuationDate(todayString());
      setInterestRate("");
      setMinimumPayment("");
      setDueDay("");
      setNotes("");
      router.refresh();
    } catch (error) {
      showErrorToast(
        itemType === "asset"
          ? "Could not create asset"
          : "Could not create liability",
        error,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div className="grid gap-2">
        <Label htmlFor="nw-item-name">Name</Label>
        <Input
          id="nw-item-name"
          value={itemName}
          onChange={(event) => setItemName(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="nw-item-type">Type</Label>
        <select
          id="nw-item-type"
          className="h-11 rounded-2xl border bg-background/60 px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
          value={itemType}
          onChange={(event) => handleTypeChange(event.target.value as ItemType)}
        >
          <option value="asset">Asset</option>
          <option value="liability">Liability</option>
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="nw-item-kind">Kind</Label>
        <Input
          id="nw-item-kind"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="nw-item-currency">Currency</Label>
        <Input
          id="nw-item-currency"
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          maxLength={3}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="nw-item-value">Value</Label>
        <Input
          id="nw-item-value"
          type="number"
          inputMode="decimal"
          step="any"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          required
        />
      </div>
      {itemType === "asset" ? (
        <div className="grid gap-2">
          <Label htmlFor="nw-item-valuation-date">Valuation date</Label>
          <Input
            id="nw-item-valuation-date"
            type="date"
            value={valuationDate}
            onChange={(event) => setValuationDate(event.target.value)}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-2">
            <Label htmlFor="nw-item-interest-rate">Interest rate (%)</Label>
            <Input
              id="nw-item-interest-rate"
              type="number"
              inputMode="decimal"
              step="any"
              value={interestRate}
              onChange={(event) => setInterestRate(event.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nw-item-min-payment">Minimum payment</Label>
            <Input
              id="nw-item-min-payment"
              type="number"
              inputMode="decimal"
              step="any"
              value={minimumPayment}
              onChange={(event) => setMinimumPayment(event.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nw-item-due-day">Due day</Label>
            <Input
              id="nw-item-due-day"
              type="number"
              min={1}
              max={31}
              value={dueDay}
              onChange={(event) => setDueDay(event.target.value)}
              placeholder="Optional"
            />
          </div>
        </>
      )}
      <div className="grid gap-2">
        <Label htmlFor="nw-item-notes">Notes</Label>
        <Input
          id="nw-item-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional"
        />
      </div>
      <Button disabled={loading} type="submit">
        {loading
          ? "Creating..."
          : itemType === "asset"
            ? "Create asset"
            : "Create liability"}
      </Button>
    </form>
  );
}
