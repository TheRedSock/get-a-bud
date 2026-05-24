#!/usr/bin/env node

/**
 * Programmatic Drizzle migration runner using @neondatabase/serverless.
 *
 * drizzle-kit's CLI uses the `pg` driver which does not cleanly close TCP
 * connections to Neon's serverless proxy on Windows, causing indefinite hangs.
 * This script uses the Neon serverless driver (WebSocket-based) which exits
 * cleanly after all queries complete.
 *
 * Usage:
 *   node scripts/db-migrate.mjs [env-file]                  Apply pending migrations
 *   node scripts/db-migrate.mjs [env-file] --baseline       Record ALL migrations
 *       as applied without executing (for existing databases).
 *   node scripts/db-migrate.mjs [env-file] --baseline=TAG   Record migrations up to
 *       TAG as applied, then stop. Subsequent `db:migrate` will apply the rest.
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

// Parse CLI args: [env-file] [--baseline[=tag]]
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const positional = args.filter((a) => !a.startsWith("--"));
const baselineFlag = flags.find((f) => f.startsWith("--baseline"));
const baselineMode = Boolean(baselineFlag);
// Optional: --baseline=0002_green_speed limits baseline to that migration tag
const baselineUntilTag = baselineFlag?.includes("=")
  ? baselineFlag.split("=")[1]
  : null;

const envFileArg = positional[0] || ".env.local";
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

/**
 * Compute a normalized hash for a migration file.
 * Normalizes CRLF → LF before hashing so the same file produces the same hash
 * regardless of OS line endings or git autocrlf settings.
 */
function migrationHash(sqlContent) {
  const normalized = sqlContent.replaceAll("\r\n", "\n");
  return createHash("sha256").update(normalized).digest("hex");
}

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
    const hash = migrationHash(sqlContent);

    // In baseline mode with a target tag: stop AFTER processing the target,
    // regardless of whether it was already applied or newly baselined.
    const isBaselineTarget = baselineMode && baselineUntilTag && entry.tag === baselineUntilTag;

    if (appliedHashes.has(hash)) {
      if (isBaselineTarget) break;
      continue;
    }

    if (baselineMode) {
      // Record migration as applied without executing SQL
      console.log(`Baseline: ${entry.tag}`);
      await pool.query(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES ($1, $2)",
        [hash, entry.when],
      );
      appliedCount++;
      if (isBaselineTarget) break;
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
  } else if (baselineMode) {
    console.log(`Baselined ${appliedCount} migration(s).`);
  } else {
    console.log(`Applied ${appliedCount} migration(s) successfully.`);
  }
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
