import { z } from "zod";

/**
 * Central environment configuration with Zod validation.
 *
 * All server-side env reads should go through this module instead of
 * accessing `process.env` directly. This gives us:
 * - Fail-fast on missing required config at startup
 * - Typed access without non-null assertions
 * - Clear classification of required vs. optional vars
 * - No secret values logged on validation failure
 */

const isProduction = process.env.NODE_ENV === "production";

// --- Server-only schema ---

const serverSchema = z.object({
  // Core infrastructure — always required
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),
  FIELD_ENCRYPTION_KEY: z
    .string()
    .min(1, "FIELD_ENCRYPTION_KEY is required")
    .refine((value) => Buffer.from(value, "base64").length === 32, {
      message: "FIELD_ENCRYPTION_KEY must decode to 32 bytes",
    }),

  // Platform environment (provided by runtime, not user-configured)
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  VERCEL_ENV: z
    .enum(["production", "preview", "development"])
    .optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),

  // Observability & security — required in production, optional in dev
  SENTRY_DSN: isProduction
    ? z.string().url("SENTRY_DSN must be a valid URL in production")
    : z.string().url().optional(),
  ARCJET_KEY: isProduction
    ? z.string().min(1, "ARCJET_KEY is required in production")
    : z.string().optional(),

  // OAuth providers — optional (conditionally enabled)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_ID: z.string().optional(),
  GITHUB_SECRET: z.string().optional(),

  // Background jobs — Inngest
  // INNGEST_ENV routes events to the correct branch:
  //   "development" locally, "preview" in Vercel Preview, unset in production.
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  INNGEST_ENV: z.string().optional(),
  INNGEST_SERVE_ORIGIN: z.string().url().optional(),

  // Enable Banking integration
  ENABLE_BANKING_BASE_URL: z.string().url().optional(),
  ENABLE_BANKING_APPLICATION_ID: z.string().optional(),
  ENABLE_BANKING_PEM_PATH: z.string().optional(),

  // Enable Banking test-only values
  ENABLE_BANKING_TEST_APPLICATION_ID: z.string().optional(),
  ENABLE_BANKING_TEST_PEM_PATH: z.string().optional(),
});

// --- Public (client-safe) schema ---

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_ENV: z
    .enum(["development", "preview", "production", "test"])
    .optional(),
});

// --- Parse and export ---

export type ServerEnv = z.infer<typeof serverSchema>;
export type PublicEnv = z.infer<typeof publicSchema>;

function parseEnv() {
  const serverResult = serverSchema.safeParse(process.env);
  const publicResult = publicSchema.safeParse(process.env);

  const errors: string[] = [];

  if (!serverResult.success) {
    for (const issue of serverResult.error.issues) {
      const path = issue.path.join(".");
      errors.push(`  ${path}: ${issue.message}`);
    }
  }

  if (!publicResult.success) {
    for (const issue of publicResult.error.issues) {
      const path = issue.path.join(".");
      errors.push(`  ${path}: ${issue.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed:\n${errors.join("\n")}\n\n` +
        "Check your .env.local file or deployment environment variables.",
    );
  }

  return {
    server: serverResult.data as ServerEnv,
    public: publicResult.data as PublicEnv,
  };
}

const parsed = parseEnv();

/**
 * Validated server-side environment variables.
 * Never import this in client components.
 */
export const serverEnv: ServerEnv = parsed.server;

/**
 * Validated public environment variables (safe for client exposure).
 */
export const publicEnv: PublicEnv = parsed.public;
