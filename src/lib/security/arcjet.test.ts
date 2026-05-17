import { enforceActionRateLimit } from "./arcjet";

function requestHeaders() {
  return new Headers({ "x-forwarded-for": "203.0.113.10" });
}

describe("enforceActionRateLimit", () => {
  it("allows actions when Arcjet allows the request", async () => {
    const limiter = {
      protect: vi.fn().mockResolvedValue({ isDenied: () => false }),
    } as unknown as Parameters<typeof enforceActionRateLimit>[0];

    await expect(
      enforceActionRateLimit(limiter, "user-1", { headers: requestHeaders() }),
    ).resolves.toBeUndefined();
    expect(limiter.protect).toHaveBeenCalledOnce();
  });

  it("throws a catalog rate limit error when Arcjet denies the request", async () => {
    const limiter = {
      protect: vi.fn().mockResolvedValue({ isDenied: () => true }),
    } as unknown as Parameters<typeof enforceActionRateLimit>[0];

    await expect(
      enforceActionRateLimit(limiter, "user-1", { headers: requestHeaders() }),
    ).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
    });
  });
});
