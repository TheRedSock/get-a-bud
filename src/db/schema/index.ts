/**
 * Schema barrel file. Re-exports all tables, enums, and relations so that
 * consumers can import from "@/db/schema" without knowing the internal split.
 */

// Auth
export { users, authAccounts, sessions, verificationTokens } from "./auth";

// Households & Memberships
export { membershipRoleEnum, households, memberships } from "./households";

// Categories & Merchants
export {
  categoryGroups,
  categories,
  merchants,
  merchantAliases,
} from "./categories";

// Financial Accounts
export { accountKindEnum, financialAccounts } from "./accounts";

// Transactions
export {
  transactionSourceEnum,
  transactionStatusEnum,
  transactions,
  categorizationRules,
  transactionLinks,
} from "./transactions";

// Budgets
export { budgetTypeEnum, budgets, budgetLines } from "./budgets";

// Recurring Bills
export {
  billCadenceEnum,
  recurringBills,
  recurringBillHistory,
} from "./bills";

// Assets & Liabilities
export { assets, liabilities } from "./assets";

// Ingestion
export {
  ingestionProviderEnum,
  syncStatusEnum,
  ingestionConnections,
  providerAccounts,
  syncRuns,
  exchangeRates,
} from "./ingestion";

// Classification
export { classificationModels } from "./classification";

// Audit
export { auditEvents } from "./audit";

// Relations
export {
  usersRelations,
  householdsRelations,
  financialAccountsRelations,
  transactionsRelations,
  categoryGroupsRelations,
  categoriesRelations,
  merchantsRelations,
  merchantAliasesRelations,
  transactionLinksRelations,
  classificationModelsRelations,
  recurringBillsRelations,
  recurringBillHistoryRelations,
} from "./relations";
