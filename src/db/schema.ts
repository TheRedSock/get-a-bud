import { relations, sql } from "drizzle-orm";
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
  "semi_annual",
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
  classificationCorrectionsSinceTrain: integer(
    "classification_corrections_since_train",
  )
    .notNull()
    .default(0),
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

export const categoryGroups = pgTable(
  "category_groups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("category_groups_household_key_uidx").on(
      table.householdId,
      table.key,
    ),
    index("category_groups_household_idx").on(table.householdId),
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
    groupId: text("group_id")
      .notNull()
      .references(() => categoryGroups.id),
    name: text("name").notNull(),
    color: text("color").notNull().default("var(--chart-1)"),
    icon: text("icon").notNull().default("circle"),
    isIncome: boolean("is_income").notNull().default(false),
    isSystem: boolean("is_system").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("categories_household_toplevel_name_uidx")
      .on(table.householdId, table.name)
      .where(sql`${table.parentId} IS NULL`),
    uniqueIndex("categories_household_parent_name_uidx")
      .on(table.householdId, table.parentId, table.name)
      .where(sql`${table.parentId} IS NOT NULL`),
    index("categories_household_idx").on(table.householdId),
  ],
);

export const merchants = pgTable(
  "merchants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    canonicalName: text("canonical_name").notNull(),
    normalizedCanonicalName: text("normalized_canonical_name").notNull(),
    defaultCategoryId: text("default_category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("merchants_household_idx").on(table.householdId),
    index("merchants_household_normalized_idx").on(
      table.householdId,
      table.normalizedCanonicalName,
    ),
  ],
);

export const merchantAliases = pgTable(
  "merchant_aliases",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    source: text("source").notNull().default("unknown"),
    transactionType: text("transaction_type"),
    paymentChannel: text("payment_channel"),
    confidence: numeric("confidence", { precision: 3, scale: 2 })
      .notNull()
      .default("1.0"),
    matchType: text("match_type").notNull().default("user"),
    sampleTransactionId: text("sample_transaction_id"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("merchant_aliases_household_alias_uidx").on(
      table.householdId,
      table.normalizedAlias,
    ),
    index("merchant_aliases_household_idx").on(table.householdId),
    index("merchant_aliases_merchant_idx").on(table.merchantId),
    index("merchant_aliases_normalized_trgm_idx").using(
      "gin",
      sql`${table.normalizedAlias} gin_trgm_ops`,
    ),
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
    merchantId: text("merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
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
    // Phase 1A: parser-extracted fields
    transactionType: text("transaction_type"),
    paymentChannel: text("payment_channel"),
    parserSource: text("parser_source"),
    categorySource: text("category_source"),
    categoryConfidence: numeric("category_confidence", {
      precision: 3,
      scale: 2,
    }),
    // Phase 3B: suggested fields for amber-zone confidence
    suggestedCategoryId: text("suggested_category_id").references(
      () => categories.id,
      { onDelete: "set null" },
    ),
    suggestedDescription: text("suggested_description"),
    suggestedMerchantName: text("suggested_merchant_name"),
    // Phase 2A: transfer linking
    linkedTransactionId: text("linked_transaction_id").references(
      (): AnyPgColumn => transactions.id,
      { onDelete: "set null" },
    ),
    transferGroupId: text("transfer_group_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("transactions_household_date_idx").on(table.householdId, table.date),
    index("transactions_account_idx").on(table.accountId),
    index("transactions_merchant_idx").on(table.merchantId),
    index("transactions_category_idx").on(table.categoryId),
    index("transactions_search_trgm_idx")
      .using("gin", sql`${table.searchText} gin_trgm_ops`),
    uniqueIndex("transactions_source_uidx").on(
      table.source,
      table.sourceTransactionId,
      table.accountId,
    ),
    index("transactions_transfer_group_idx").on(table.transferGroupId),
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
    matchField: text("match_field").notNull().default("merchant"),
    priority: integer("priority").notNull().default(100),
    learnedFromTransactionId: text("learned_from_transaction_id"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("categorization_rules_household_idx").on(table.householdId),
    uniqueIndex("categorization_rules_household_field_matcher_uidx").on(
      table.householdId,
      table.matchField,
      table.matcher,
    ),
  ],
);

export const transactionLinks = pgTable(
  "transaction_links",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    groupId: text("group_id").notNull(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("source"),
    confidence: numeric("confidence", { precision: 3, scale: 2 })
      .notNull()
      .default("1.0"),
    confirmed: boolean("confirmed").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("transaction_links_group_txn_uidx").on(
      table.groupId,
      table.transactionId,
    ),
    index("transaction_links_household_idx").on(table.householdId),
    index("transaction_links_transaction_idx").on(table.transactionId),
    index("transaction_links_group_idx").on(table.groupId),
  ],
);

export const classificationModels = pgTable(
  "classification_models",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    modelType: text("model_type").notNull().default("naive_bayes"),
    modelData: jsonb("model_data").$type<unknown[]>(),
    version: integer("version").notNull(),
    trainedAt: timestamp("trained_at", { mode: "date" }).notNull().defaultNow(),
    trainingTransactionCount: integer("training_transaction_count")
      .notNull()
      .default(0),
    accuracy: numeric("accuracy", { precision: 4, scale: 3 }),
    autoApplyThreshold: numeric("auto_apply_threshold", {
      precision: 3,
      scale: 2,
    }),
    suggestThreshold: numeric("suggest_threshold", {
      precision: 3,
      scale: 2,
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("classification_models_household_idx").on(table.householdId),
    uniqueIndex("classification_models_household_version_uidx").on(
      table.householdId,
      table.version,
    ),
  ],
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
    /** Disambiguates multiple recurring patterns for the same merchant
     *  (e.g. own Netflix EUR vs family Netflix USD, or duplicate subs).
     *  Format: "{currency}~{roundedMedianAmount}~{index}" */
    amountSignature: text("amount_signature").notNull().default(""),
    cadence: billCadenceEnum("cadence").notNull().default("monthly"),
    expectedAmount: numeric("expected_amount", { precision: 18, scale: 2 }),
    nextDueDate: date("next_due_date"),
    lastAmount: numeric("last_amount", { precision: 18, scale: 2 }),
    priceIncreaseThresholdPct: integer("price_increase_threshold_pct")
      .notNull()
      .default(15),
    isActive: boolean("is_active").notNull().default(true),
    /** Flagged when today > nextDueDate + 1.5× cadence interval.
     *  Not auto-deactivated — user may have switched payment method. */
    isPossiblyCancelled: boolean("is_possibly_cancelled")
      .notNull()
      .default(false),
    /** True when this bill was split from an interleaved duplicate cluster.
     *  Alerts the user they may be paying twice for the same service. */
    isDuplicateSubscription: boolean("is_duplicate_subscription")
      .notNull()
      .default(false),
    // Phase 2B: enhanced recurring detection fields
    detectedCadenceConfidence: numeric("detected_cadence_confidence", {
      precision: 3,
      scale: 2,
    }),
    pattern: text("pattern").default("day_of_month"),
    typicalDayOfMonth: integer("typical_day_of_month"),
    originalCurrency: text("original_currency"),
    lastOriginalAmount: numeric("last_original_amount", {
      precision: 18,
      scale: 2,
    }),
    amountTrend: text("amount_trend").default("stable"),
    lastDetectedAt: timestamp("last_detected_at", { mode: "date" }),
    transactionCount: integer("transaction_count").default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("recurring_bills_household_idx").on(table.householdId),
    uniqueIndex("recurring_bills_household_merchant_sig_uidx").on(
      table.householdId,
      table.merchantPattern,
      table.amountSignature,
    ),
  ],
);

export const recurringBillHistory = pgTable(
  "recurring_bill_history",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    billId: text("bill_id")
      .notNull()
      .references(() => recurringBills.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    originalAmount: numeric("original_amount", { precision: 18, scale: 2 }),
    originalCurrency: text("original_currency"),
    date: date("date").notNull(),
    transactionId: text("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("recurring_bill_history_bill_idx").on(table.billId),
    uniqueIndex("recurring_bill_history_bill_txn_uidx").on(
      table.billId,
      table.transactionId,
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
  categoryGroups: many(categoryGroups),
  merchants: many(merchants),
  budgets: many(budgets),
  transactionLinks: many(transactionLinks),
  classificationModels: many(classificationModels),
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
  merchant: one(merchants, {
    fields: [transactions.merchantId],
    references: [merchants.id],
  }),
  suggestedCategory: one(categories, {
    fields: [transactions.suggestedCategoryId],
    references: [categories.id],
    relationName: "suggestedCategory",
  }),
}));

export const categoryGroupsRelations = relations(
  categoryGroups,
  ({ one, many }) => ({
    household: one(households, {
      fields: [categoryGroups.householdId],
      references: [households.id],
    }),
    categories: many(categories),
  }),
);

export const categoriesRelations = relations(categories, ({ one }) => ({
  household: one(households, {
    fields: [categories.householdId],
    references: [households.id],
  }),
  group: one(categoryGroups, {
    fields: [categories.groupId],
    references: [categoryGroups.id],
  }),
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "parentChild",
  }),
}));

export const merchantsRelations = relations(merchants, ({ one, many }) => ({
  household: one(households, {
    fields: [merchants.householdId],
    references: [households.id],
  }),
  defaultCategory: one(categories, {
    fields: [merchants.defaultCategoryId],
    references: [categories.id],
  }),
  aliases: many(merchantAliases),
}));

export const merchantAliasesRelations = relations(
  merchantAliases,
  ({ one }) => ({
    household: one(households, {
      fields: [merchantAliases.householdId],
      references: [households.id],
    }),
    merchant: one(merchants, {
      fields: [merchantAliases.merchantId],
      references: [merchants.id],
    }),
  }),
);

export const transactionLinksRelations = relations(
  transactionLinks,
  ({ one }) => ({
    household: one(households, {
      fields: [transactionLinks.householdId],
      references: [households.id],
    }),
    transaction: one(transactions, {
      fields: [transactionLinks.transactionId],
      references: [transactions.id],
    }),
  }),
);

export const classificationModelsRelations = relations(
  classificationModels,
  ({ one }) => ({
    household: one(households, {
      fields: [classificationModels.householdId],
      references: [households.id],
    }),
  }),
);

export const recurringBillsRelations = relations(
  recurringBills,
  ({ one, many }) => ({
    household: one(households, {
      fields: [recurringBills.householdId],
      references: [households.id],
    }),
    category: one(categories, {
      fields: [recurringBills.categoryId],
      references: [categories.id],
    }),
    history: many(recurringBillHistory),
  }),
);

export const recurringBillHistoryRelations = relations(
  recurringBillHistory,
  ({ one }) => ({
    bill: one(recurringBills, {
      fields: [recurringBillHistory.billId],
      references: [recurringBills.id],
    }),
    transaction: one(transactions, {
      fields: [recurringBillHistory.transactionId],
      references: [transactions.id],
    }),
  }),
);
