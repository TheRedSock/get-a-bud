import { resolveClientIp } from "./resolve-client-ip";

describe("resolveClientIp", () => {
  it("uses the first x-forwarded-for address", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10, 198.51.100.1",
    });
    expect(resolveClientIp(headers)).toBe("203.0.113.10");
  });

  it("falls back to x-real-ip then localhost", () => {
    expect(resolveClientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe(
      "198.51.100.2",
    );
    expect(resolveClientIp(new Headers())).toBe("127.0.0.1");
  });
});
