describe("src/config/env", () => {
  const VALID_ENV = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/testdb?sslmode=require",
    NEXTAUTH_SECRET: "test-secret-32-bytes-long-enough",
    NEXTAUTH_URL: "http://localhost:3000",
    FIELD_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
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

  it("throws when FIELD_ENCRYPTION_KEY does not decode to 32 bytes", async () => {
    process.env = { ...VALID_ENV, FIELD_ENCRYPTION_KEY: "dG9vLXNob3J0" };

    await expect(import("@/config/env")).rejects.toThrow(
      /FIELD_ENCRYPTION_KEY/,
    );
  });

  it("treats SENTRY_DSN as optional in non-production", async () => {
    process.env = { ...VALID_ENV };

    const { serverEnv } = await import("@/config/env");
    expect(serverEnv.SENTRY_DSN).toBeUndefined();
  });

  it("defaults rate limiting to noop in non-production", async () => {
    process.env = { ...VALID_ENV };

    const { serverEnv } = await import("@/config/env");
    expect(serverEnv.RATE_LIMIT_PROVIDER).toBeUndefined();
  });

  it("accepts valid optional variables", async () => {
    process.env = {
      ...originalEnv,
      ...VALID_ENV,
      SENTRY_DSN: "https://abc@sentry.io/123",
      RATE_LIMIT_PROVIDER: "noop",
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
    };

    const { serverEnv } = await import("@/config/env");
    expect(serverEnv.SENTRY_DSN).toBe("https://abc@sentry.io/123");
    expect(serverEnv.RATE_LIMIT_PROVIDER).toBe("noop");
    expect(serverEnv.GOOGLE_CLIENT_ID).toBe("google-id");
  });

  it("requires Upstash credentials in production when provider is upstash", async () => {
    process.env = {
      ...originalEnv,
      ...VALID_ENV,
      NODE_ENV: "production",
      SENTRY_DSN: "https://abc@sentry.io/123",
      RATE_LIMIT_PROVIDER: "upstash",
    };

    await expect(import("@/config/env")).rejects.toThrow(
      /UPSTASH_REDIS_REST/,
    );
  });

  it("accepts Upstash credentials in production", async () => {
    process.env = {
      ...originalEnv,
      ...VALID_ENV,
      NODE_ENV: "production",
      SENTRY_DSN: "https://abc@sentry.io/123",
      RATE_LIMIT_PROVIDER: "upstash",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "test-token",
    };

    const { serverEnv } = await import("@/config/env");
    expect(serverEnv.UPSTASH_REDIS_REST_URL).toBe("https://example.upstash.io");
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
