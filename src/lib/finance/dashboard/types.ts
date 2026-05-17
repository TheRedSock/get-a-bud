/** Account summary for the dashboard accounts section. */
export type DashboardAccount = {
  name: string;
  kind: string;
  balance: number;
  trend: string;
};

/** Recent transaction for the dashboard transaction list. */
export type DashboardTransaction = {
  merchant: string;
  category: string;
  amount: number;
  date: string;
};

/** Budget line summary for progress bars. */
export type DashboardBudgetRow = {
  name: string;
  spent: number;
  allocated: number;
};

/** Upcoming bill for the bills section. */
export type DashboardBill = {
  name: string;
  due: string;
  amount: number;
  status: string;
};

/** Cash flow series data point for bar chart. */
export type CashFlowPoint = {
  month: string;
  income: number;
  expenses: number;
};

/** Spending breakdown data point for pie chart. */
export type SpendingPoint = {
  name: string;
  value: number;
  color: string;
};

/** Balance trend data point for area chart. */
export type BalancePoint = {
  day: string;
  balance: number;
};

/**
 * Summary card icon key. The page layer maps these to actual icon components.
 * This keeps lib/ free of React dependencies.
 */
export type SummaryCardIcon = "wallet" | "landmark" | "calendar-clock";

/** Summary card for the top-level metrics. */
export type SummaryCard = {
  label: string;
  value: number;
  icon: SummaryCardIcon;
  helper: string;
};

/** Full dashboard data shape used by the page component. */
export type DashboardData = {
  accounts: DashboardAccount[];
  transactions: DashboardTransaction[];
  budgetRows: DashboardBudgetRow[];
  bills: DashboardBill[];
  cashFlowData: CashFlowPoint[];
  spendingData: SpendingPoint[];
  balanceData: BalancePoint[];
  summaryCards: SummaryCard[];
};
