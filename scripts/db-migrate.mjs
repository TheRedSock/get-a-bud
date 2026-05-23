#!/usr/bin/env node

/**
 * Programmatic Drizzle migration runner using @neondatabase/serverless.
 *
 * drizzle-kit's CLI uses the `pg` driver which does not cleanly close TCP
 * connections to Neon's serverless proxy on Windows, causing indefinite hangs.
 * This script uses the Neon serverless driver (WebSocket-based) which exits
 * cleanly after all queries complete.
 *
 * Usage: node scripts/db-migrate.mjs [env-file]
 *   env-file defaults to .env.local
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvFile(path) {
  const contents = readFileSync(path, "utf8");
  const env = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value.replaceAll("\\n", "\n");
  }

  return env;
}

const envFileArg = process.argv[2] || ".env.local";
const envPath = resolve(process.cwd(), envFileArg);

if (!existsSync(envPath)) {
  console.error(`Environment file not found: ${envFileArg}`);
  process.exit(1);
}

const loadedEnv = parseEnvFile(envPath);
const databaseUrl = loadedEnv.DATABASE_URL;

if (!databaseUrl) {
  console.error(`DATABASE_URL not found in ${envFileArg}`);
  process.exit(1);
}

// Load migration journal
const migrationsDir = resolve(process.cwd(), "src/db/migrations");
const journalPath = resolve(migrationsDir, "meta/_journal.json");

if (!existsSync(journalPath)) {
  console.error("Migration journal not found at src/db/migrations/meta/_journal.json");
  process.exit(1);
}

const journal = JSON.parse(readFileSync(journalPath, "utf8"));

// Dynamic import of @neondatabase/serverless (ESM)
const { Pool } = await import("@neondatabase/serverless");

const pool = new Pool({ connectionString: databaseUrl });

try {
  // Ensure migrations table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  // Get already-applied migration hashes
  const { rows: applied } = await pool.query(
    "SELECT hash FROM __drizzle_migrations ORDER BY id",
  );
  const appliedHashes = new Set(applied.map((r) => r.hash));

  let appliedCount = 0;

  for (const entry of journal.entries) {
    const sqlFile = resolve(migrationsDir, `${entry.tag}.sql`);
    if (!existsSync(sqlFile)) {
      console.error(`Migration file not found: ${entry.tag}.sql`);
      process.exit(1);
    }

    const sqlContent = readFileSync(sqlFile, "utf8");
    const hash = createHash("sha256").update(sqlContent).digest("hex");

    if (appliedHashes.has(hash)) {
      continue;
    }

    console.log(`Applying: ${entry.tag}`);

    // Split on statement-breakpoint markers (drizzle-kit convention)
    const statements = sqlContent
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await pool.query(statement);
    }

    // Record in journal
    await pool.query(
      "INSERT INTO __drizzle_migrations (hash, created_at) VALUES ($1, $2)",
      [hash, entry.when],
    );

    appliedCount++;
  }

  if (appliedCount === 0) {
    console.log("No pending migrations.");
  } else {
    console.log(`Applied ${appliedCount} migration(s) successfully.`);
  }
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
