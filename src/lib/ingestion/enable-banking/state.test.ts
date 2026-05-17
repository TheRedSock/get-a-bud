describe("Enable Banking authorization state", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("hashes and compares authorization state safely", async () => {
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
    const {
      createAuthorizationState,
      safeCompareStateHash,
    } = await import("@/lib/ingestion/enable-banking/state");

    const { state, stateHash, expiresAt } = createAuthorizationState();

    expect(state).not.toBe(stateHash);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(safeCompareStateHash(state, stateHash)).toBe(true);
    expect(safeCompareStateHash("wrong", stateHash)).toBe(false);
  });

  it("uses environment app URL before request origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.test/");
    const { getAppUrl } = await import("@/lib/ingestion/enable-banking/state");

    expect(getAppUrl("http://localhost:3000/callback")).toBe("https://example.test");
  });

  it("changes hashes when the secret changes", async () => {
    vi.stubEnv("NEXTAUTH_SECRET", "first-secret");
    const { hashAuthorizationState: firstHashAuthorizationState } = await import(
      "@/lib/ingestion/enable-banking/state"
    );
    const firstHash = firstHashAuthorizationState("state");

    vi.stubEnv("NEXTAUTH_SECRET", "second-secret");
    vi.resetModules();
    const { hashAuthorizationState } = await import(
      "@/lib/ingestion/enable-banking/state"
    );

    expect(hashAuthorizationState("state")).not.toBe(firstHash);
  });
});
