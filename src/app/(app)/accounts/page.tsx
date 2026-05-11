import { Plus, RefreshCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accounts } from "@/lib/demo-data";
import { formatMoney } from "@/lib/utils";

export default function AccountsPage() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Accounts</CardTitle>
          <Button>
            <RefreshCcw className="size-4" /> Sync balances
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3">
          {accounts.map((account) => (
            <div
              key={account.name}
              className="grid gap-4 rounded-3xl border bg-background/40 p-5 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{account.name}</p>
                  <Badge>{account.kind}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Manual or Enable Banking synced account.
                </p>
              </div>
              <div className="sm:text-right">
                <p className="text-2xl font-semibold">{formatMoney(account.balance)}</p>
                <p className="text-sm text-muted-foreground">{account.trend}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

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
  );
}
