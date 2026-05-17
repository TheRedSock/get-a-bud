import { ArrowUpRight, CalendarClock, Landmark, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  BalanceTrendChart,
  CashFlowChart,
  SpendingPieChart,
} from "@/components/dashboard/charts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  accounts as demoAccounts,
  balanceData as demoBalanceData,
  bills as demoBills,
  budgetRows as demoBudgetRows,
  cashFlowData as demoCashFlowData,
  spendingData as demoSpendingData,
  transactions as demoTransactions,
} from "@/lib/demo-data";
import { getDashboardData } from "@/lib/finance/dashboard";
import { getActiveHousehold } from "@/lib/finance/household";
import { formatCents } from "@/lib/finance/money";

import type { DashboardData, SummaryCardIcon } from "@/lib/finance/dashboard";

type DashboardPageProps = {
  demo?: boolean;
};

/** Maps domain icon keys to actual Lucide components (UI layer concern). */
const SUMMARY_ICONS: Record<SummaryCardIcon, LucideIcon> = {
  wallet: Wallet,
  landmark: Landmark,
  "calendar-clock": CalendarClock,
};

export default async function DashboardPage({ demo = false }: DashboardPageProps = {}) {
  const data: DashboardData = demo
    ? buildDemoData()
    : await getLiveData();

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-3">
        {data.summaryCards.map((card) => {
          const Icon = SUMMARY_ICONS[card.icon];

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
                <p className="mt-1 text-3xl font-semibold">{formatCents(card.value)}</p>
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
            {data.cashFlowData.length ? (
              <CashFlowChart data={data.cashFlowData} />
            ) : (
              <EmptyDashboardState message="Transactions will shape this chart after your first sync or manual entry." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Spending mix</CardTitle>
          </CardHeader>
          <CardContent>
            {data.spendingData.length ? (
              <SpendingPieChart data={data.spendingData} />
            ) : (
              <EmptyDashboardState message="No spending data yet." />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Balance trend</CardTitle>
          </CardHeader>
          <CardContent>
            {data.balanceData.length ? (
              <BalanceTrendChart data={data.balanceData} />
            ) : (
              <EmptyDashboardState message="Connect or add accounts to see balances." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Budget health</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {data.budgetRows.length ? (
              data.budgetRows.map((row) => (
              <div key={row.name}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span>{row.name}</span>
                   <span className="text-muted-foreground">
                    {formatCents(row.spent)} / {formatCents(row.allocated)}
                  </span>
                </div>
                <Progress
                  value={row.allocated ? (row.spent / row.allocated) * 100 : 0}
                />
              </div>
              ))
            ) : (
              <EmptyDashboardState message="Create a budget to track category health." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Upcoming bills</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {data.bills.length ? (
              data.bills.map((bill) => (
              <div
                key={bill.name}
                className="flex items-center justify-between rounded-2xl bg-secondary/50 p-3"
              >
                <div>
                  <p className="font-medium">{bill.name}</p>
                  <p className="text-xs text-muted-foreground">{bill.due}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCents(bill.amount)}</p>
                  <p className="text-xs text-muted-foreground">{bill.status}</p>
                </div>
              </div>
              ))
            ) : (
              <EmptyDashboardState message="Recurring bills will appear after they are detected or added." />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {data.accounts.length ? (
              data.accounts.map((account) => (
              <div
                key={account.name}
                className="flex items-center justify-between rounded-2xl border bg-background/40 p-4"
              >
                <div>
                  <p className="font-medium">{account.name}</p>
                  <p className="text-sm text-muted-foreground">{account.kind}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCents(account.balance)}</p>
                  <p className="text-sm text-muted-foreground">{account.trend}</p>
                </div>
              </div>
              ))
            ) : (
              <EmptyDashboardState message="No accounts yet." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {data.transactions.length ? (
              data.transactions.map((transaction) => (
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
                <p className="font-semibold">{formatCents(transaction.amount)}</p>
              </div>
              ))
            ) : (
              <EmptyDashboardState message="No transactions yet." />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function EmptyDashboardState({ message }: { message: string }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-3xl border border-dashed bg-background/40 p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data loaders
// ---------------------------------------------------------------------------

async function getLiveData(): Promise<DashboardData> {
  const household = await getActiveHousehold();
  return getDashboardData(household.householdId);
}

function buildDemoData(): DashboardData {
  return {
    accounts: demoAccounts,
    transactions: demoTransactions,
    budgetRows: demoBudgetRows,
    bills: demoBills,
    cashFlowData: demoCashFlowData,
    spendingData: demoSpendingData,
    balanceData: demoBalanceData,
    summaryCards: [
      {
        label: "Current balance",
        value: 118400,
        icon: "wallet",
        helper: "+12.5% after payday",
      },
      {
        label: "Remaining budget",
        value: 23900,
        icon: "landmark",
        helper: "18 days left",
      },
      {
        label: "Upcoming bills",
        value: 20599,
        icon: "calendar-clock",
        helper: "4 expected",
      },
    ],
  };
}
