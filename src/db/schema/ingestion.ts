import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { households } from "./households";
import { financialAccounts } from "./accounts";

// ---------- Enums ----------

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

// ---------- Ingestion Connections ----------

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

// ---------- Provider Accounts ----------

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
    lastBalanceCents: bigint("last_balance_cents", { mode: "number" }),
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

// ---------- Sync Runs ----------

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

// ---------- Exchange Rates ----------

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
