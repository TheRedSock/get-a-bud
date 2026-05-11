import { Plus, RefreshCcw } from "lucide-react";

import { AccountEditor } from "@/components/account-editor";
import { BankSyncPanel } from "@/components/bank-sync-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db";
import { financialAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getActiveHousehold } from "@/lib/finance/household";

function getBalanceWarning(metadata: Record<string, unknown> | null | undefined) {
  const balance = metadata?.balance;

  if (!balance || typeof balance !== "object") {
    return undefined;
  }

  const warning = balance as Record<string, unknown>;

  return {
    discrepancy: Boolean(warning.discrepancy),
    offsetAmount:
      typeof warning.offsetAmount === "string" ? warning.offsetAmount : undefined,
    manualTransactionsPresent: Boolean(warning.manualTransactionsPresent),
    manualTransactionCount:
      typeof warning.manualTransactionCount === "number"
        ? warning.manualTransactionCount
        : undefined,
  };
}

export default async function AccountsPage() {
  const household = await getActiveHousehold();
  const accounts = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.householdId, household.householdId));

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Accounts</CardTitle>
          <Button asChild variant="outline">
            <a href="#bank-sync">
              <RefreshCcw className="size-4" /> Sync balances
            </a>
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3">
          {accounts.length ? (
            accounts.map((account) => (
              <AccountEditor
                key={account.id}
                account={{
                  ...account,
                  balanceWarning: getBalanceWarning(account.metadata),
                }}
              />
            ))
          ) : (
            <div className="rounded-3xl border border-dashed bg-background/40 p-8 text-center">
              <p className="font-semibold">No accounts yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Sync a connected bank or add a manual account to start building your
                ledger.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6" id="bank-sync">
        <BankSyncPanel />

        <Card>
          <CardHeader>
            <CardTitle>Add manual account</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4">
              <div className="grid gap-2">
                <Label>Name</Label>
                <Input placeholder="Emergency savings" />
              </div>
              <div className="grid gap-2">
                <Label>Type</Label>
                <Input placeholder="checking, savings, loan..." />
              </div>
              <div className="grid gap-2">
                <Label>Opening balance</Label>
                <Input inputMode="decimal" placeholder="0" />
              </div>
              <Button type="button">
                <Plus className="size-4" /> Save account
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
