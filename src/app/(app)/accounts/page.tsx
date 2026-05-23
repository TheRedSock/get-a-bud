import { Plus, RefreshCcw } from "lucide-react";

import { AccountsLiveHint } from "@/components/accounts/accounts-live-hint";
import { AccountEditor } from "@/components/account-editor";
import { BankSyncPanel } from "@/components/bank-sync-panel";
import { CreateAccountForm } from "@/components/forms/create-account-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listHouseholdAccounts } from "@/lib/finance/accounts/queries";
import { getActiveHousehold } from "@/lib/finance/household";
import { getHouseholdConnections } from "@/lib/ingestion/enable-banking/queries";

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
  const [accounts, connections] = await Promise.all([
    listHouseholdAccounts(household.householdId),
    getHouseholdConnections(household.householdId),
  ]);

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
          <AccountsLiveHint />
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
        <BankSyncPanel initialConnections={connections} />

        <Card>
          <CardHeader>
            <CardTitle>Add manual account</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateAccountForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
