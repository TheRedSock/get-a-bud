/**
 * Default category groups, categories, and merchant rules.
 *
 * Groups are the high-level spending sections (Essentials, Bills, etc.).
 * Categories are organized within groups and seeded at registration.
 * Merchant rules map known merchant names to categories for auto-categorization.
 */

export interface DefaultGroup {
  key: string;
  label: string;
  sortOrder: number;
}

export interface DefaultCategory {
  name: string;
  groupKey: string;
  color: string;
  icon: string;
  isIncome: boolean;
  sortOrder: number;
}

export interface DefaultMerchantRule {
  matcher: string;
  matchField: "merchant" | "description";
  matcherType: "contains" | "exact" | "prefix";
  category: string;
}

// -------------------------------------------------------------------------
// Default Groups (5 groups)
// -------------------------------------------------------------------------

export const defaultGroups: readonly DefaultGroup[] = [
  { key: "essentials", label: "Essentials", sortOrder: 0 },
  { key: "bills", label: "Bills & Commitments", sortOrder: 1 },
  { key: "lifestyle", label: "Lifestyle", sortOrder: 2 },
  { key: "income", label: "Income", sortOrder: 3 },
  { key: "meta", label: "Transfers & Fees", sortOrder: 4 },
] as const;

// -------------------------------------------------------------------------
// Default Categories (20 categories across 5 groups)
// -------------------------------------------------------------------------

export const defaultCategories: readonly DefaultCategory[] = [
  // Essentials
  { name: "Groceries", groupKey: "essentials", color: "var(--chart-3)", icon: "shopping-cart", isIncome: false, sortOrder: 0 },
  { name: "Health & Pharmacy", groupKey: "essentials", color: "var(--chart-1)", icon: "heart-pulse", isIncome: false, sortOrder: 1 },
  { name: "Pets", groupKey: "essentials", color: "var(--chart-2)", icon: "paw-print", isIncome: false, sortOrder: 2 },

  // Bills & Commitments
  { name: "Housing", groupKey: "bills", color: "var(--chart-1)", icon: "home", isIncome: false, sortOrder: 0 },
  { name: "Utilities & Telecom", groupKey: "bills", color: "var(--chart-5)", icon: "zap", isIncome: false, sortOrder: 1 },
  { name: "Insurance", groupKey: "bills", color: "var(--chart-4)", icon: "shield", isIncome: false, sortOrder: 2 },
  { name: "Loans & Debt", groupKey: "bills", color: "var(--chart-6)", icon: "landmark", isIncome: false, sortOrder: 3 },
  { name: "Subscriptions", groupKey: "bills", color: "var(--chart-6)", icon: "repeat", isIncome: false, sortOrder: 4 },
  { name: "Transport & Fuel", groupKey: "bills", color: "var(--chart-4)", icon: "car", isIncome: false, sortOrder: 5 },

  // Lifestyle
  { name: "Dining & Takeout", groupKey: "lifestyle", color: "var(--chart-7)", icon: "utensils", isIncome: false, sortOrder: 0 },
  { name: "Shopping", groupKey: "lifestyle", color: "var(--chart-3)", icon: "shopping-bag", isIncome: false, sortOrder: 1 },
  { name: "Entertainment", groupKey: "lifestyle", color: "var(--chart-2)", icon: "ticket", isIncome: false, sortOrder: 2 },
  { name: "Personal Care", groupKey: "lifestyle", color: "var(--chart-5)", icon: "scissors", isIncome: false, sortOrder: 3 },
  { name: "Gifts", groupKey: "lifestyle", color: "var(--chart-1)", icon: "gift", isIncome: false, sortOrder: 4 },

  // Income
  { name: "Salary", groupKey: "income", color: "var(--chart-2)", icon: "briefcase", isIncome: true, sortOrder: 0 },
  { name: "Other Income", groupKey: "income", color: "var(--chart-2)", icon: "trending-up", isIncome: true, sortOrder: 1 },

  // Transfers & Fees
  { name: "Transfers", groupKey: "meta", color: "var(--chart-8)", icon: "arrow-right-left", isIncome: false, sortOrder: 0 },
  { name: "Investments", groupKey: "meta", color: "var(--chart-4)", icon: "line-chart", isIncome: false, sortOrder: 1 },
  { name: "Fees & Charges", groupKey: "meta", color: "var(--chart-6)", icon: "receipt", isIncome: false, sortOrder: 2 },
  { name: "Other", groupKey: "meta", color: "var(--chart-8)", icon: "circle", isIncome: false, sortOrder: 3 },
] as const;

// -------------------------------------------------------------------------
// Default Merchant Rules (seeded at registration)
// -------------------------------------------------------------------------

export const defaultMerchantRules: readonly DefaultMerchantRule[] = [
  // Groceries
  { matcher: "rema", matchField: "merchant", matcherType: "contains", category: "Groceries" },
  { matcher: "kiwi", matchField: "merchant", matcherType: "contains", category: "Groceries" },
  { matcher: "coop", matchField: "merchant", matcherType: "contains", category: "Groceries" },
  { matcher: "meny", matchField: "merchant", matcherType: "contains", category: "Groceries" },
  { matcher: "spar", matchField: "merchant", matcherType: "contains", category: "Groceries" },
  { matcher: "bunnpris", matchField: "merchant", matcherType: "contains", category: "Groceries" },
  { matcher: "extra", matchField: "merchant", matcherType: "contains", category: "Groceries" },
  { matcher: "joker", matchField: "merchant", matcherType: "contains", category: "Groceries" },

  // Transport
  { matcher: "ruter", matchField: "merchant", matcherType: "contains", category: "Transport & Fuel" },
  { matcher: "vy", matchField: "merchant", matcherType: "exact", category: "Transport & Fuel" },
  { matcher: "circle k", matchField: "merchant", matcherType: "contains", category: "Transport & Fuel" },
  { matcher: "esso", matchField: "merchant", matcherType: "contains", category: "Transport & Fuel" },
  { matcher: "shell", matchField: "merchant", matcherType: "contains", category: "Transport & Fuel" },

  // Subscriptions
  { matcher: "netflix", matchField: "merchant", matcherType: "contains", category: "Subscriptions" },
  { matcher: "spotify", matchField: "merchant", matcherType: "contains", category: "Subscriptions" },
  { matcher: "hbo", matchField: "merchant", matcherType: "contains", category: "Subscriptions" },
  { matcher: "disney", matchField: "merchant", matcherType: "contains", category: "Subscriptions" },
  { matcher: "youtube", matchField: "merchant", matcherType: "contains", category: "Subscriptions" },
  { matcher: "apple.com/bill", matchField: "merchant", matcherType: "contains", category: "Subscriptions" },
  { matcher: "itvx", matchField: "merchant", matcherType: "contains", category: "Subscriptions" },
  { matcher: "cursor", matchField: "merchant", matcherType: "contains", category: "Subscriptions" },

  // Utilities
  { matcher: "fortum", matchField: "merchant", matcherType: "contains", category: "Utilities & Telecom" },
  { matcher: "fjordkraft", matchField: "merchant", matcherType: "contains", category: "Utilities & Telecom" },
  { matcher: "telenor", matchField: "merchant", matcherType: "contains", category: "Utilities & Telecom" },
  { matcher: "telia", matchField: "merchant", matcherType: "contains", category: "Utilities & Telecom" },
  { matcher: "ice.no", matchField: "merchant", matcherType: "contains", category: "Utilities & Telecom" },

  // Dining
  { matcher: "mcd", matchField: "merchant", matcherType: "contains", category: "Dining & Takeout" },
  { matcher: "burger king", matchField: "merchant", matcherType: "contains", category: "Dining & Takeout" },
  { matcher: "starbucks", matchField: "merchant", matcherType: "contains", category: "Dining & Takeout" },
  { matcher: "foodora", matchField: "merchant", matcherType: "contains", category: "Dining & Takeout" },
  { matcher: "wolt", matchField: "merchant", matcherType: "contains", category: "Dining & Takeout" },
] as const;

/**
 * Legacy exports for backward compatibility.
 * @deprecated Use defaultCategories and defaultMerchantRules instead.
 */
export const demoMerchants = [
  { matcher: "ruter", category: "Transport & Fuel" },
  { matcher: "vy", category: "Transport & Fuel" },
  { matcher: "rema", category: "Groceries" },
  { matcher: "kiwi", category: "Groceries" },
  { matcher: "netflix", category: "Subscriptions" },
  { matcher: "spotify", category: "Subscriptions" },
  { matcher: "fortum", category: "Utilities & Telecom" },
] as const;
