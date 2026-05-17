"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAccount } from "@/app/(app)/accounts/actions";
import { unwrapAction } from "@/lib/actions/client";
import { showErrorToast } from "@/lib/toast-errors";

type AccountKind =
  | "checking"
  | "savings"
  | "credit_card"
  | "cash"
  | "investment"
  | "loan"
  | "mortgage"
  | "property"
  | "other";

const accountKinds: AccountKind[] = [
  "checking",
  "savings",
  "credit_card",
  "cash",
  "investment",
  "loan",
  "mortgage",
  "property",
  "other",
];

export function CreateAccountForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("checking");
  const [currency, setCurrency] = useState("NOK");
  const [currentBalance, setCurrentBalance] = useState("0");
  const [institutionName, setInstitutionName] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const payload: {
        name: string;
        kind: AccountKind;
        currency: string;
        currentBalance: number;
        institutionName?: string;
      } = {
        name,
        kind,
        currency,
        currentBalance: Number(currentBalance),
      };

      const trimmedInstitution = institutionName.trim();
      if (trimmedInstitution) {
        payload.institutionName = trimmedInstitution;
      }

      await unwrapAction(
        createAccount(payload),
        "Could not create account",
      );
      toast.success("Account created");
      setName("");
      setKind("checking");
      setCurrency("NOK");
      setCurrentBalance("0");
      setInstitutionName("");
      router.refresh();
    } catch (error) {
      showErrorToast("Could not create account", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div className="grid gap-2">
        <Label htmlFor="account-name">Name</Label>
        <Input
          id="account-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="account-kind">Type</Label>
        <select
          id="account-kind"
          className="h-11 rounded-2xl border bg-background/60 px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
          value={kind}
          onChange={(event) => setKind(event.target.value as AccountKind)}
        >
          {accountKinds.map((accountKind) => (
            <option key={accountKind} value={accountKind}>
              {accountKind.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="account-currency">Currency</Label>
        <Input
          id="account-currency"
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          maxLength={3}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="account-balance">Starting balance</Label>
        <Input
          id="account-balance"
          type="number"
          inputMode="decimal"
          step="any"
          value={currentBalance}
          onChange={(event) => setCurrentBalance(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="account-institution">Institution</Label>
        <Input
          id="account-institution"
          value={institutionName}
          onChange={(event) => setInstitutionName(event.target.value)}
          placeholder="Optional"
        />
      </div>
      <Button disabled={loading} type="submit">
        {loading ? "Creating..." : "Create account"}
      </Button>
    </form>
  );
}
