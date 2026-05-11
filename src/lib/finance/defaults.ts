export const defaultCategories = [
  { name: "Income", color: "var(--chart-2)", icon: "trending-up", isIncome: true },
  { name: "Housing", color: "var(--chart-1)", icon: "home", isIncome: false },
  { name: "Groceries", color: "var(--chart-3)", icon: "shopping-cart", isIncome: false },
  { name: "Transport", color: "var(--chart-4)", icon: "car", isIncome: false },
  { name: "Utilities", color: "var(--chart-5)", icon: "bolt", isIncome: false },
  { name: "Subscriptions", color: "var(--chart-6)", icon: "repeat", isIncome: false },
  { name: "Dining", color: "var(--chart-7)", icon: "utensils", isIncome: false },
  { name: "Savings", color: "var(--chart-8)", icon: "piggy-bank", isIncome: false },
] as const;

export const demoMerchants = [
  { matcher: "ruter", category: "Transport" },
  { matcher: "vy", category: "Transport" },
  { matcher: "rema", category: "Groceries" },
  { matcher: "kiwi", category: "Groceries" },
  { matcher: "netflix", category: "Subscriptions" },
  { matcher: "spotify", category: "Subscriptions" },
  { matcher: "fortum", category: "Utilities" },
] as const;
