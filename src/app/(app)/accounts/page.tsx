import { Plus, RefreshCcw } from "lucide-react";

import { BankSyncPanel } from "@/components/bank-sync-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db";
import { financialAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getActiveHousehold } from "@/lib/finance/household";
import { formatMoney } from "@/lib/utils";

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
              <div
                key={account.id}
                className="grid gap-4 rounded-3xl border bg-background/40 p-5 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{account.name}</p>
                    <Badge>{account.kind}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {account.isManual
                      ? "Manual account"
                      : account.institutionName ?? "Synced account"}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-2xl font-semibold">
                    {formatMoney(Number(account.currentBalance))}
                  </p>
                  <p className="text-sm text-muted-foreground">{account.currency}</p>
                </div>
              </div>
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
