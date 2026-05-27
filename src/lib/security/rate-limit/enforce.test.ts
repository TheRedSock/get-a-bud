import { enforceRateLimit } from "./enforce";
import { getRateLimitProvider, resolveRateLimitProviderName } from "./get-provider";
import { checkUpstashRateLimit } from "./providers/upstash";

vi.mock("./get-provider", () => ({
  resolveRateLimitProviderName: vi.fn(() => "noop"),
  getRateLimitProvider: vi.fn(),
}));

vi.mock("./providers/upstash", () => ({
  checkUpstashRateLimit: vi.fn(),
}));

function requestHeaders() {
  return new Headers({ "x-forwarded-for": "203.0.113.10" });
}

describe("enforceRateLimit", () => {
  beforeEach(() => {
    vi.mocked(resolveRateLimitProviderName).mockReturnValue("noop");
    vi.mocked(getRateLimitProvider).mockReturnValue({
      check: vi.fn().mockResolvedValue({ allowed: true }),
    });
  });

  it("allows when the provider allows the request", async () => {
    await expect(
      enforceRateLimit("authenticatedMutation", {
        userId: "user-1",
        headers: requestHeaders(),
      }),
    ).resolves.toBeUndefined();

    expect(getRateLimitProvider().check).toHaveBeenCalledWith({
      presetId: "authenticatedMutation",
      identifier: "user:user-1",
    });
  });

  it("keys unauthenticated requests by IP", async () => {
    await enforceRateLimit("register", { headers: requestHeaders() });

    expect(getRateLimitProvider().check).toHaveBeenCalledWith({
      presetId: "register",
      identifier: "ip:203.0.113.10",
    });
  });

  it("throws a catalog rate limit error when the provider denies", async () => {
    vi.mocked(getRateLimitProvider).mockReturnValue({
      check: vi.fn().mockResolvedValue({ allowed: false }),
    });

    await expect(
      enforceRateLimit("register", { headers: requestHeaders() }),
    ).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
    });
  });

  describe("upstash provider path", () => {
    beforeEach(() => {
      vi.mocked(resolveRateLimitProviderName).mockReturnValue("upstash");
    });

    it("delegates to checkUpstashRateLimit with fail-open semantics", async () => {
      vi.mocked(checkUpstashRateLimit).mockResolvedValue({
        allowed: true,
        failedOpen: false,
      });

      await expect(
        enforceRateLimit("authenticatedMutation", {
          userId: "user-1",
          headers: requestHeaders(),
        }),
      ).resolves.toBeUndefined();

      expect(checkUpstashRateLimit).toHaveBeenCalledWith({
        presetId: "authenticatedMutation",
        identifier: "user:user-1",
      });
    });

    it("allows traffic when Upstash fails open due to infrastructure error", async () => {
      vi.mocked(checkUpstashRateLimit).mockResolvedValue({
        allowed: true,
        failedOpen: true,
      });

      await expect(
        enforceRateLimit("register", { headers: requestHeaders() }),
      ).resolves.toBeUndefined();
    });

    it("denies when Upstash reports the limit is exceeded", async () => {
      vi.mocked(checkUpstashRateLimit).mockResolvedValue({
        allowed: false,
        failedOpen: false,
      });

      await expect(
        enforceRateLimit("bulkOperation", {
          userId: "user-1",
          headers: requestHeaders(),
        }),
      ).rejects.toMatchObject({
        code: "rate_limited",
        status: 429,
      });
    });
  });
});
