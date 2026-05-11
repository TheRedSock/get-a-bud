import { ArrowUpRight, CalendarClock, Landmark, Wallet } from "lucide-react";

import {
  BalanceTrendChart,
  CashFlowChart,
  SpendingPieChart,
} from "@/components/dashboard/charts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { accounts, bills, budgetRows, transactions } from "@/lib/demo-data";
import { formatMoney } from "@/lib/utils";

const summaryCards = [
  { label: "Current balance", value: 118400, icon: Wallet, helper: "+12.5% after payday" },
  { label: "Remaining budget", value: 23900, icon: Landmark, helper: "18 days left" },
  { label: "Upcoming bills", value: 20599, icon: CalendarClock, helper: "4 expected" },
];

export default function DashboardPage() {
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-3">
        {summaryCards.map((card) => {
          const Icon = card.icon;

          return (
            <Card key={card.label} className="overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <Badge>
                    <ArrowUpRight className="mr-1 size-3" />
                    Live
                  </Badge>
                </div>
                <p className="mt-5 text-sm text-muted-foreground">{card.label}</p>
                <p className="mt-1 text-3xl font-semibold">{formatMoney(card.value)}</p>
                <p className="mt-2 text-sm text-muted-foreground">{card.helper}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Cash flow</CardTitle>
          </CardHeader>
          <CardContent>
            <CashFlowChart />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Spending mix</CardTitle>
          </CardHeader>
          <CardContent>
            <SpendingPieChart />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Balance trend</CardTitle>
          </CardHeader>
          <CardContent>
            <BalanceTrendChart />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Budget health</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {budgetRows.map((row) => (
              <div key={row.name}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span>{row.name}</span>
                  <span className="text-muted-foreground">
                    {formatMoney(row.spent)} / {formatMoney(row.allocated)}
                  </span>
                </div>
                <Progress value={(row.spent / row.allocated) * 100} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Upcoming bills</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {bills.map((bill) => (
              <div
                key={bill.name}
                className="flex items-center justify-between rounded-2xl bg-secondary/50 p-3"
              >
                <div>
                  <p className="font-medium">{bill.name}</p>
                  <p className="text-xs text-muted-foreground">{bill.due}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatMoney(bill.amount)}</p>
                  <p className="text-xs text-muted-foreground">{bill.status}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {accounts.map((account) => (
              <div
                key={account.name}
                className="flex items-center justify-between rounded-2xl border bg-background/40 p-4"
              >
                <div>
                  <p className="font-medium">{account.name}</p>
                  <p className="text-sm text-muted-foreground">{account.kind}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatMoney(account.balance)}</p>
                  <p className="text-sm text-muted-foreground">{account.trend}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {transactions.map((transaction) => (
              <div
                key={`${transaction.merchant}-${transaction.date}`}
                className="flex items-center justify-between rounded-2xl border bg-background/40 p-4"
              >
                <div>
                  <p className="font-medium">{transaction.merchant}</p>
                  <p className="text-sm text-muted-foreground">
                    {transaction.category} · {transaction.date}
                  </p>
                </div>
                <p className="font-semibold">{formatMoney(transaction.amount)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
