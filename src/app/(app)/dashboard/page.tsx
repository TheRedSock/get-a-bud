import { ArrowUpRight, CalendarClock, Landmark, Wallet } from "lucide-react";
import { desc, eq } from "drizzle-orm";

import {
  BalanceTrendChart,
  CashFlowChart,
  SpendingPieChart,
} from "@/components/dashboard/charts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { db } from "@/db";
import {
  financialAccounts,
  recurringBills,
  transactions,
} from "@/db/schema";
import {
  accounts as demoAccounts,
  balanceData as demoBalanceData,
  bills as demoBills,
  budgetRows as demoBudgetRows,
  cashFlowData as demoCashFlowData,
  spendingData as demoSpendingData,
  transactions as demoTransactions,
} from "@/lib/demo-data";
import { getBudgetsWithSpending } from "@/lib/finance/budget-calculations";
import { getActiveHousehold } from "@/lib/finance/household";
import { formatCents } from "@/lib/finance/money";

type DashboardPageProps = {
  demo?: boolean;
};

const monthFormatter = new Intl.DateTimeFormat("en", { month: "short" });

function buildCashFlowData(rows: Array<{ date: string; amountCents: number }>) {
  const grouped = new Map<string, { month: string; income: number; expenses: number }>();

  for (const row of rows) {
    const date = new Date(`${row.date}T00:00:00`);
    const month = monthFormatter.format(date);
    const amount = row.amountCents;
    const current = grouped.get(month) ?? { month, income: 0, expenses: 0 };

    if (amount >= 0) {
      current.income += amount;
    } else {
      current.expenses += Math.abs(amount);
    }

    grouped.set(month, current);
  }

  return [...grouped.values()];
}

function buildSpendingData(rows: Array<{ source: string; amountCents: number }>) {
  const colors = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ];
  const grouped = new Map<string, number>();

  for (const row of rows) {
    if (row.amountCents >= 0) continue;
    const label = row.source === "enable_banking" ? "Bank imports" : "Manual";
    grouped.set(label, (grouped.get(label) ?? 0) + Math.abs(row.amountCents));
  }

  return [...grouped.entries()].map(([name, value], index) => ({
    name,
    value,
    color: colors[index % colors.length],
  }));
}

function buildBalanceData(accounts: Array<{ currentBalanceCents: number | null }>) {
  const balance = accounts.reduce(
    (sum, account) => sum + (account.currentBalanceCents ?? 0),
    0,
  );

  return balance ? [{ day: "Now", balance }] : [];
}

export default async function DashboardPage({ demo = false }: DashboardPageProps = {}) {
  const data = demo
    ? {
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
            icon: Wallet,
            helper: "+12.5% after payday",
          },
          {
            label: "Remaining budget",
            value: 23900,
            icon: Landmark,
            helper: "18 days left",
          },
          {
            label: "Upcoming bills",
            value: 20599,
            icon: CalendarClock,
            helper: "4 expected",
          },
        ],
      }
    : await getLiveDashboardData();

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-3">
        {data.summaryCards.map((card) => {
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

async function getLiveDashboardData() {
  const household = await getActiveHousehold();
  const [accountRows, transactionRows, budgetsWithSpending, billRows] = await Promise.all([
    db
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.householdId, household.householdId)),
    db
      .select()
      .from(transactions)
      .where(eq(transactions.householdId, household.householdId))
      .orderBy(desc(transactions.date))
      .limit(50),
    getBudgetsWithSpending(household.householdId),
    db
      .select()
      .from(recurringBills)
      .where(eq(recurringBills.householdId, household.householdId)),
  ]);
  const currentBalance = accountRows.reduce(
    (sum, account) => sum + (account.currentBalanceCents ?? 0),
    0,
  );
  const spending = transactionRows
    .filter((transaction) => transaction.amountCents < 0)
    .reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0);

  return {
    accounts: accountRows.map((account) => ({
      name: account.name,
      kind: account.kind,
      balance: account.currentBalanceCents ?? 0,
      trend: account.isManual ? "Manual" : account.institutionName ?? "Synced",
    })),
    transactions: transactionRows.slice(0, 8).map((transaction) => ({
      merchant: transaction.merchantName ?? transaction.description,
      category: transaction.source.replace("_", " "),
      amount: transaction.amountCents,
      date: transaction.date,
    })),
    budgetRows: budgetsWithSpending.flatMap((budget) =>
      budget.lines.map((line) => ({
        name: line.categoryName,
        spent: line.spentAmountCents,
        allocated: line.allocatedAmountCents,
      })),
    ),
    bills: billRows.map((bill) => ({
      name: bill.name,
      due: bill.nextDueDate ?? "No due date",
      amount: bill.expectedAmountCents ?? bill.lastAmountCents ?? 0,
      status: bill.isActive ? "Active" : "Paused",
    })),
    cashFlowData: buildCashFlowData(transactionRows),
    spendingData: buildSpendingData(transactionRows),
    balanceData: buildBalanceData(accountRows),
    summaryCards: [
      {
        label: "Current balance",
        value: currentBalance,
        icon: Wallet,
        helper: accountRows.length
          ? `${accountRows.length} account${accountRows.length === 1 ? "" : "s"}`
          : "No accounts connected",
      },
      {
        label: "Month spending",
        value: spending,
        icon: Landmark,
        helper: transactionRows.length
          ? `${transactionRows.length} recent transaction${
              transactionRows.length === 1 ? "" : "s"
            }`
          : "No transactions yet",
      },
      {
        label: "Upcoming bills",
        value: billRows.reduce(
          (sum, bill) => sum + (bill.expectedAmountCents ?? bill.lastAmountCents ?? 0),
          0,
        ),
        icon: CalendarClock,
        helper: `${billRows.length} expected`,
      },
    ],
  };
}
