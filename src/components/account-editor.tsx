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

type AccountEditorProps = {
  account: {
    id: string;
    name: string;
    kind: AccountKind;
    currency: string;
    currentBalance: string;
    institutionName: string | null;
    isManual: boolean;
    balanceWarning?: {
      discrepancy?: boolean;
      offsetAmount?: string;
      manualTransactionsPresent?: boolean;
      manualTransactionCount?: number;
    };
  };
};

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

export function AccountEditor({ account }: AccountEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(account.name);
  const [kind, setKind] = useState<AccountKind>(account.kind);
  const [institutionName, setInstitutionName] = useState(
    account.institutionName ?? "",
  );
  const balanceWarning = account.balanceWarning;

  async function save() {
    setSaving(true);

    try {
      const response = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          kind,
          institutionName: institutionName.trim() || null,
        }),
      });

      await parseApiResponse(response);
      toast.success("Account updated");
      setEditing(false);
      router.refresh();
    } catch (error) {
      showErrorToast("Could not update account", error);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="grid gap-4 rounded-3xl border bg-background/40 p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor={`account-name-${account.id}`}>Name</Label>
            <Input
              id={`account-name-${account.id}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`account-kind-${account.id}`}>Type</Label>
            <select
              id={`account-kind-${account.id}`}
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
          <div className="grid gap-2 sm:col-span-3">
            <Label htmlFor={`account-institution-${account.id}`}>Institution</Label>
            <Input
              id={`account-institution-${account.id}`}
              value={institutionName}
              onChange={(event) => setInstitutionName(event.target.value)}
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
    <div className="grid gap-4 rounded-3xl border bg-background/40 p-5 sm:grid-cols-[1fr_auto] sm:items-start">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{account.name}</p>
          <Badge>{account.kind.replace("_", " ")}</Badge>
          {!account.isManual ? <Badge>bank synced</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {account.isManual
            ? "Manual account"
            : account.institutionName ?? "Synced account"}
        </p>
        {balanceWarning?.discrepancy ? (
          <p className="mt-2 text-sm text-amber-600">
            Added an opening balance adjustment of{" "}
            {formatMoney(Number(balanceWarning.offsetAmount ?? 0), account.currency)}
            .
          </p>
        ) : null}
        {balanceWarning?.manualTransactionsPresent ? (
          <p className="mt-1 text-sm text-amber-600">
            This synced account has {balanceWarning.manualTransactionCount} manual
            transaction
            {balanceWarning.manualTransactionCount === 1 ? "" : "s"} that may affect
            reconciliation.
          </p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:justify-items-end">
        <div className="sm:text-right">
          <p className="text-2xl font-semibold">
            {formatMoney(Number(account.currentBalance), account.currency)}
          </p>
          <p className="text-sm text-muted-foreground">
            Calculated from transactions
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => setEditing(true)}>
          <Edit3 className="size-4" />
          Edit metadata
        </Button>
      </div>
    </div>
  );
}
