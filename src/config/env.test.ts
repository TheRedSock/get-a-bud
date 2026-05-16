import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("src/config/env", () => {
  const VALID_ENV = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/testdb?sslmode=require",
    NEXTAUTH_SECRET: "test-secret-32-bytes-long-enough",
    NEXTAUTH_URL: "http://localhost:3000",
    FIELD_ENCRYPTION_KEY: "dGVzdC1lbmNyeXB0aW9uLWtleS0zMi1ieXRlcw==",
    NODE_ENV: "test" as const,
  } satisfies Partial<NodeJS.ProcessEnv>;

  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    // Reset module registry so env.ts re-parses on each import
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("parses a complete valid environment", async () => {
    process.env = { ...originalEnv, ...VALID_ENV };

    const { serverEnv } = await import("@/config/env");

    expect(serverEnv.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
    expect(serverEnv.NEXTAUTH_SECRET).toBe(VALID_ENV.NEXTAUTH_SECRET);
    expect(serverEnv.NEXTAUTH_URL).toBe(VALID_ENV.NEXTAUTH_URL);
    expect(serverEnv.FIELD_ENCRYPTION_KEY).toBe(VALID_ENV.FIELD_ENCRYPTION_KEY);
    expect(serverEnv.NODE_ENV).toBe("test");
  });

  it("throws when DATABASE_URL is missing", async () => {
    const { DATABASE_URL: _, ...envWithout } = VALID_ENV;
    process.env = { ...envWithout };

    await expect(import("@/config/env")).rejects.toThrow(
      /DATABASE_URL/,
    );
  });

  it("throws when NEXTAUTH_SECRET is missing", async () => {
    const { NEXTAUTH_SECRET: _, ...envWithout } = VALID_ENV;
    process.env = { ...envWithout };

    await expect(import("@/config/env")).rejects.toThrow(
      /NEXTAUTH_SECRET/,
    );
  });

  it("throws when NEXTAUTH_URL is invalid", async () => {
    process.env = { ...VALID_ENV, NEXTAUTH_URL: "not-a-url" };

    await expect(import("@/config/env")).rejects.toThrow(
      /NEXTAUTH_URL/,
    );
  });

  it("treats SENTRY_DSN as optional in non-production", async () => {
    process.env = { ...VALID_ENV };

    const { serverEnv } = await import("@/config/env");
    expect(serverEnv.SENTRY_DSN).toBeUndefined();
  });

  it("treats ARCJET_KEY as optional in non-production", async () => {
    process.env = { ...VALID_ENV };

    const { serverEnv } = await import("@/config/env");
    expect(serverEnv.ARCJET_KEY).toBeUndefined();
  });

  it("accepts valid optional variables", async () => {
    process.env = {
      ...originalEnv,
      ...VALID_ENV,
      SENTRY_DSN: "https://abc@sentry.io/123",
      ARCJET_KEY: "ajkey_test123",
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
    };

    const { serverEnv } = await import("@/config/env");
    expect(serverEnv.SENTRY_DSN).toBe("https://abc@sentry.io/123");
    expect(serverEnv.ARCJET_KEY).toBe("ajkey_test123");
    expect(serverEnv.GOOGLE_CLIENT_ID).toBe("google-id");
  });

  it("parses public env variables", async () => {
    process.env = {
      ...originalEnv,
      ...VALID_ENV,
      NEXT_PUBLIC_APP_URL: "https://app.example.com",
    };

    const { publicEnv } = await import("@/config/env");
    expect(publicEnv.NEXT_PUBLIC_APP_URL).toBe("https://app.example.com");
  });
});
