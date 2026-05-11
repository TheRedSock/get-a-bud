import {
  createAuthorizationState,
  getAppUrl,
  hashAuthorizationState,
  safeCompareStateHash,
} from "@/lib/ingestion/enable-banking/state";

describe("Enable Banking authorization state", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("hashes and compares authorization state safely", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "test-secret");

    const { state, stateHash, expiresAt } = createAuthorizationState();

    expect(state).not.toBe(stateHash);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(safeCompareStateHash(state, stateHash)).toBe(true);
    expect(safeCompareStateHash("wrong", stateHash)).toBe(false);
  });

  it("uses environment app URL before request origin", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.test/");

    expect(getAppUrl("http://localhost:3000/callback")).toBe("https://example.test");
  });

  it("changes hashes when the secret changes", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "first-secret");
    const firstHash = hashAuthorizationState("state");

    vi.stubEnv("NEXTAUTH_SECRET", "second-secret");

    expect(hashAuthorizationState("state")).not.toBe(firstHash);
  });
});
