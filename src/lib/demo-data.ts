export const cashFlowData = [
  { month: "Jan", income: 52000, expenses: 43800 },
  { month: "Feb", income: 52000, expenses: 47200 },
  { month: "Mar", income: 54500, expenses: 45100 },
  { month: "Apr", income: 52000, expenses: 49100 },
  { month: "May", income: 56500, expenses: 42900 },
  { month: "Jun", income: 52000, expenses: 40200 },
];

export const spendingData = [
  { name: "Housing", value: 18000, color: "var(--chart-1)" },
  { name: "Groceries", value: 8200, color: "var(--chart-2)" },
  { name: "Transport", value: 4200, color: "var(--chart-3)" },
  { name: "Subscriptions", value: 1900, color: "var(--chart-4)" },
  { name: "Dining", value: 3600, color: "var(--chart-5)" },
];

export const balanceData = [
  { day: "1", balance: 84500 },
  { day: "5", balance: 81200 },
  { day: "10", balance: 79400 },
  { day: "15", balance: 75300 },
  { day: "20", balance: 71400 },
  { day: "25", balance: 124800 },
  { day: "30", balance: 118400 },
];

export const accounts = [
  { name: "Everyday Checking", kind: "Checking", balance: 38400, trend: "+4.2%" },
  { name: "Buffer Savings", kind: "Savings", balance: 80000, trend: "+1.8%" },
  { name: "Credit Card", kind: "Credit", balance: -12400, trend: "-8.1%" },
];

export const transactions = [
  { merchant: "Salary", category: "Income", amount: 52000, date: "May 25" },
  { merchant: "Rema 1000", category: "Groceries", amount: -684, date: "May 27" },
  { merchant: "Netflix", category: "Subscriptions", amount: -129, date: "May 26" },
  { merchant: "Mortgage", category: "Housing", amount: -18000, date: "May 25" },
  { merchant: "Ruter", category: "Transport", amount: -897, date: "May 24" },
];

export const budgetRows = [
  { name: "Housing", spent: 18000, allocated: 18500 },
  { name: "Groceries", spent: 8200, allocated: 9000 },
  { name: "Transport", spent: 4200, allocated: 5000 },
  { name: "Subscriptions", spent: 1900, allocated: 2300 },
  { name: "Dining", spent: 3600, allocated: 4500 },
];

export const bills = [
  { name: "Mortgage", due: "May 25", amount: 18000, status: "Paid" },
  { name: "Power bill", due: "Jun 02", amount: 1420, status: "Upcoming" },
  { name: "Spotify Family", due: "Jun 03", amount: 199, status: "Upcoming" },
  { name: "Insurance", due: "Jun 08", amount: 980, status: "Watch" },
];

export const netWorthItems = [
  { name: "Cash", value: 118400 },
  { name: "Property estimate", value: 4850000 },
  { name: "Stocks savings", value: 265000 },
  { name: "Mortgage", value: -3120000 },
  { name: "Consumer debt", value: -22000 },
];
