import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import { serverEnv } from "@/config/env";
import * as schema from "@/db/schema";

const pool = new Pool({ connectionString: serverEnv.DATABASE_URL });

export const db = drizzle(pool, { schema });

/** Lightweight DB connectivity check for health probes. */
export async function pingDatabase(): Promise<boolean> {
  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      return true;
    } finally {
      client.release();
    }
  } catch {
    return false;
  }
}
