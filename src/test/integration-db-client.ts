/**
 * Drop-in replacement for `@/db` that uses the `postgres` package (TCP)
 * instead of `@neondatabase/serverless` (WebSocket). This allows integration
 * tests to connect to Docker Compose Postgres locally.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import * as schema from "@/db/schema";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://get_a_bud:get_a_bud@127.0.0.1:5433/get_a_bud_test?sslmode=disable";

const client = postgres(connectionString, { max: 5 });

export const db = drizzle(client, { schema });

export async function pingDatabase(): Promise<boolean> {
  try {
    await client`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
