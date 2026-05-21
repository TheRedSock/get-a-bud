import { sql } from "drizzle-orm";
import postgres from "postgres";

import { db } from "@/db";

const TABLES = [
  "audit_events",
  "transaction_links",
  "recurring_bill_history",
  "recurring_bills",
  "sync_runs",
  "provider_accounts",
  "transactions",
  "financial_accounts",
  "ingestion_connections",
  "budget_lines",
  "budgets",
  "categorization_rules",
  "classification_models",
  "merchant_aliases",
  "categories",
  "category_groups",
  "merchants",
  "assets",
  "liabilities",
  "memberships",
  "households",
  "sessions",
  "auth_accounts",
  "verification_tokens",
  "users",
  "exchange_rates",
] as const;

let adminSql: ReturnType<typeof postgres> | null = null;

function getAdminSql() {
  if (!adminSql) {
    adminSql = postgres(process.env.DATABASE_URL!, { max: 1 });
  }
  return adminSql;
}

/** Truncate all application tables between integration tests. */
export async function resetDatabase() {
  const client = getAdminSql();
  const tableList = TABLES.map((t) => `"${t}"`).join(", ");
  await client.unsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}

/** Returns true when Postgres is reachable (for skipping locally without Docker). */
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    const client = getAdminSql();
    await client`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function closeIntegrationDb() {
  if (adminSql) {
    await adminSql.end();
    adminSql = null;
  }
}

export { db, sql };
