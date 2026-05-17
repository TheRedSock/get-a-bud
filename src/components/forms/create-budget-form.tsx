"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBudget } from "@/app/(app)/budgets/actions";
import { unwrapAction } from "@/lib/actions/client";
import { showErrorToast } from "@/lib/toast-errors";

type BudgetType = "monthly" | "weekly" | "zero_based" | "envelope";

const budgetTypes: BudgetType[] = [
  "monthly",
  "weekly",
  "zero_based",
  "envelope",
];

export function CreateBudgetForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<BudgetType>("monthly");
  const [currency, setCurrency] = useState("NOK");
  const [periodStartDay, setPeriodStartDay] = useState("1");
  const [paycheckAnchorDay, setPaycheckAnchorDay] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const payload: {
        name: string;
        type: BudgetType;
        currency: string;
        periodStartDay: number;
        paycheckAnchorDay?: number;
      } = {
        name,
        type,
        currency,
        periodStartDay: Number(periodStartDay),
      };

      if (paycheckAnchorDay) {
        payload.paycheckAnchorDay = Number(paycheckAnchorDay);
      }

      await unwrapAction(
        createBudget(payload),
        "Could not create budget",
      );
      toast.success("Budget created");
      setName("");
      setType("monthly");
      setCurrency("NOK");
      setPeriodStartDay("1");
      setPaycheckAnchorDay("");
      router.refresh();
    } catch (error) {
      showErrorToast("Could not create budget", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div className="grid gap-2">
        <Label htmlFor="budget-name">Name</Label>
        <Input
          id="budget-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="budget-type">Type</Label>
        <select
          id="budget-type"
          className="h-11 rounded-2xl border bg-background/60 px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
          value={type}
          onChange={(event) => setType(event.target.value as BudgetType)}
        >
          {budgetTypes.map((budgetType) => (
            <option key={budgetType} value={budgetType}>
              {budgetType.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="budget-currency">Currency</Label>
        <Input
          id="budget-currency"
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          maxLength={3}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="budget-period-start">Period start day</Label>
        <Input
          id="budget-period-start"
          type="number"
          min={1}
          max={31}
          value={periodStartDay}
          onChange={(event) => setPeriodStartDay(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="budget-paycheck-anchor">Paycheck anchor day</Label>
        <Input
          id="budget-paycheck-anchor"
          type="number"
          min={1}
          max={31}
          value={paycheckAnchorDay}
          onChange={(event) => setPaycheckAnchorDay(event.target.value)}
          placeholder="Optional"
        />
      </div>
      <Button disabled={loading} type="submit">
        {loading ? "Creating..." : "Create budget"}
      </Button>
    </form>
  );
}
