import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "admin",
  "member",
  "viewer",
]);

export const accountKindEnum = pgEnum("financial_account_kind", [
  "checking",
  "savings",
  "credit_card",
  "cash",
  "investment",
  "loan",
  "mortgage",
  "property",
  "other",
]);

export const transactionSourceEnum = pgEnum("transaction_source", [
  "manual",
  "enable_banking",
  "import",
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending",
  "posted",
  "excluded",
]);

export const budgetTypeEnum = pgEnum("budget_type", [
  "monthly",
  "weekly",
  "zero_based",
  "envelope",
]);

export const ingestionProviderEnum = pgEnum("ingestion_provider", [
  "enable_banking",
  "manual",
  "import",
]);

export const syncStatusEnum = pgEnum("sync_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "rate_limited",
]);

export const billCadenceEnum = pgEnum("bill_cadence", [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
  "unknown",
]);

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  defaultCurrency: text("default_currency").notNull().default("NOK"),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const authAccounts = pgTable(
  "auth_accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    primaryKey({
      columns: [table.provider, table.providerAccountId],
    }),
    index("auth_accounts_user_id_idx").on(table.userId),
  ],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.identifier, table.token],
    }),
  ],
);

export const households = pgTable("households", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  defaultCurrency: text("default_currency").notNull().default("NOK"),
  theme: text("theme").notNull().default("aurora"),
  createdById: text("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("owner"),
    canViewNetWorth: boolean("can_view_net_worth").notNull().default(true),
    canManageIntegrations: boolean("can_manage_integrations")
      .notNull()
      .default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("memberships_household_user_uidx").on(
      table.householdId,
      table.userId,
    ),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): AnyPgColumn => categories.id),
    name: text("name").notNull(),
    color: text("color").notNull().default("var(--chart-1)"),
    icon: text("icon").notNull().default("circle"),
    isIncome: boolean("is_income").notNull().default(false),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("categories_household_name_uidx").on(
      table.householdId,
      table.name,
    ),
    index("categories_household_idx").on(table.householdId),
  ],
);

export const financialAccounts = pgTable(
  "financial_accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: accountKindEnum("kind").notNull().default("checking"),
    currency: text("currency").notNull().default("NOK"),
    institutionName: text("institution_name"),
    mask: text("mask"),
    currentBalance: numeric("current_balance", {
      precision: 18,
      scale: 2,
    })
      .notNull()
      .default("0"),
    availableBalance: numeric("available_balance", {
      precision: 18,
      scale: 2,
    }),
    creditLimit: numeric("credit_limit", { precision: 18, scale: 2 }),
    isManual: boolean("is_manual").notNull().default(true),
    isArchived: boolean("is_archived").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("financial_accounts_household_idx").on(table.householdId),
    index("financial_accounts_kind_idx").on(table.kind),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    source: transactionSourceEnum("source").notNull().default("manual"),
    sourceTransactionId: text("source_transaction_id"),
    status: transactionStatusEnum("status").notNull().default("posted"),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("NOK"),
    originalAmount: numeric("original_amount", { precision: 18, scale: 2 }),
    originalCurrency: text("original_currency"),
    date: date("date").notNull(),
    bookedAt: timestamp("booked_at", { mode: "date" }),
    merchantName: text("merchant_name"),
    normalizedMerchantName: text("normalized_merchant_name"),
    description: text("description").notNull(),
    notes: text("notes"),
    searchText: text("search_text").notNull().default(""),
    isRecurringCandidate: boolean("is_recurring_candidate")
      .notNull()
      .default(false),
    excludedFromBudget: boolean("excluded_from_budget")
      .notNull()
      .default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("transactions_household_date_idx").on(table.householdId, table.date),
    index("transactions_account_idx").on(table.accountId),
    index("transactions_category_idx").on(table.categoryId),
    uniqueIndex("transactions_source_uidx").on(
      table.source,
      table.sourceTransactionId,
      table.accountId,
    ),
  ],
);

export const categorizationRules = pgTable(
  "categorization_rules",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    matcher: text("matcher").notNull(),
    matcherType: text("matcher_type").notNull().default("contains"),
    priority: integer("priority").notNull().default(100),
    learnedFromTransactionId: text("learned_from_transaction_id"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("categorization_rules_household_idx").on(table.householdId)],
);

export const budgets = pgTable(
  "budgets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: budgetTypeEnum("type").notNull().default("monthly"),
    currency: text("currency").notNull().default("NOK"),
    periodStartDay: integer("period_start_day").notNull().default(1),
    paycheckAnchorDay: integer("paycheck_anchor_day"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("budgets_household_idx").on(table.householdId)],
);

export const budgetLines = pgTable(
  "budget_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    budgetId: text("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    allocatedAmount: numeric("allocated_amount", {
      precision: 18,
      scale: 2,
    }).notNull(),
    rolloverEnabled: boolean("rollover_enabled").notNull().default(false),
    envelopeBalance: numeric("envelope_balance", {
      precision: 18,
      scale: 2,
    }).notNull().default("0"),
  },
  (table) => [
    uniqueIndex("budget_lines_budget_category_uidx").on(
      table.budgetId,
      table.categoryId,
    ),
  ],
);

export const recurringBills = pgTable(
  "recurring_bills",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    merchantPattern: text("merchant_pattern").notNull(),
    cadence: billCadenceEnum("cadence").notNull().default("monthly"),
    expectedAmount: numeric("expected_amount", { precision: 18, scale: 2 }),
    nextDueDate: date("next_due_date"),
    lastAmount: numeric("last_amount", { precision: 18, scale: 2 }),
    priceIncreaseThresholdPct: integer("price_increase_threshold_pct")
      .notNull()
      .default(15),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("recurring_bills_household_idx").on(table.householdId),
    uniqueIndex("recurring_bills_household_merchant_uidx").on(
      table.householdId,
      table.merchantPattern,
    ),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("property"),
    currency: text("currency").notNull().default("NOK"),
    estimatedValue: numeric("estimated_value", {
      precision: 18,
      scale: 2,
    }).notNull(),
    valuationDate: date("valuation_date").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("assets_household_idx").on(table.householdId)],
);

export const liabilities = pgTable(
  "liabilities",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("loan"),
    currency: text("currency").notNull().default("NOK"),
    currentBalance: numeric("current_balance", {
      precision: 18,
      scale: 2,
    }).notNull(),
    interestRate: numeric("interest_rate", { precision: 8, scale: 4 }),
    minimumPayment: numeric("minimum_payment", { precision: 18, scale: 2 }),
    dueDay: integer("due_day"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("liabilities_household_idx").on(table.householdId)],
);

export const ingestionConnections = pgTable(
  "ingestion_connections",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    provider: ingestionProviderEnum("provider").notNull(),
    displayName: text("display_name").notNull(),
    externalApplicationId: text("external_application_id"),
    encryptedPrivateKey: text("encrypted_private_key"),
    encryptedPrivateKeyIv: text("encrypted_private_key_iv"),
    encryptedPrivateKeyTag: text("encrypted_private_key_tag"),
    consentSessionId: text("consent_session_id"),
    authorizationId: text("authorization_id"),
    authorizationStateHash: text("authorization_state_hash"),
    authorizationStateExpiresAt: timestamp("authorization_state_expires_at", {
      mode: "date",
    }),
    consentExpiresAt: timestamp("consent_expires_at", { mode: "date" }),
    status: text("status").notNull().default("needs_setup"),
    lastSyncedAt: timestamp("last_synced_at", { mode: "date" }),
    rateLimitedUntil: timestamp("rate_limited_until", { mode: "date" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("ingestion_connections_household_idx").on(table.householdId),
    index("ingestion_connections_auth_state_idx").on(
      table.authorizationStateHash,
    ),
  ],
);

export const providerAccounts = pgTable(
  "provider_accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    connectionId: text("connection_id")
      .notNull()
      .references(() => ingestionConnections.id, { onDelete: "cascade" }),
    financialAccountId: text("financial_account_id").references(
      () => financialAccounts.id,
      { onDelete: "set null" },
    ),
    providerAccountId: text("provider_account_id").notNull(),
    providerAccountName: text("provider_account_name"),
    currency: text("currency").notNull().default("NOK"),
    lastBalance: numeric("last_balance", { precision: 18, scale: 2 }),
    /**
     * Diagnostic-only: last known continuation key written during sync.
     * The authoritative cursor state lives in `syncRuns.metadata.enableBanking.accountCursors`
     * which includes `paramsKey` validation to prevent stale cursor replay.
     * Do NOT read this field for sync resumption. See P2-7 in architecture-audit.md.
     */
    syncCursor: text("sync_cursor"),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("provider_accounts_connection_external_uidx").on(
      table.connectionId,
      table.providerAccountId,
    ),
  ],
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    connectionId: text("connection_id").references(
      () => ingestionConnections.id,
      { onDelete: "set null" },
    ),
    provider: ingestionProviderEnum("provider").notNull(),
    status: syncStatusEnum("status").notNull().default("queued"),
    startedAt: timestamp("started_at", { mode: "date" }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { mode: "date" }),
    importedAccounts: integer("imported_accounts").notNull().default(0),
    importedTransactions: integer("imported_transactions").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => [index("sync_runs_connection_idx").on(table.connectionId)],
);

export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    baseCurrency: text("base_currency").notNull(),
    quoteCurrency: text("quote_currency").notNull(),
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    asOfDate: date("as_of_date").notNull(),
    source: text("source").notNull().default("manual"),
  },
  (table) => [
    uniqueIndex("exchange_rates_pair_date_uidx").on(
      table.baseCurrency,
      table.quoteCurrency,
      table.asOfDate,
    ),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
}));

export const householdsRelations = relations(households, ({ many }) => ({
  memberships: many(memberships),
  accounts: many(financialAccounts),
  transactions: many(transactions),
  categories: many(categories),
  budgets: many(budgets),
}));

export const financialAccountsRelations = relations(
  financialAccounts,
  ({ one, many }) => ({
    household: one(households, {
      fields: [financialAccounts.householdId],
      references: [households.id],
    }),
    transactions: many(transactions),
  }),
);

export const transactionsRelations = relations(transactions, ({ one }) => ({
  household: one(households, {
    fields: [transactions.householdId],
    references: [households.id],
  }),
  account: one(financialAccounts, {
    fields: [transactions.accountId],
    references: [financialAccounts.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
}));
