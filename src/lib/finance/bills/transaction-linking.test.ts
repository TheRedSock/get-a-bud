import { describe, expect, it } from "vitest";

import {
  escapeIlikePattern,
  merchantTokensFromBill,
  normalizeLinkSearchQuery,
} from "./transaction-linking";

describe("transaction-linking helpers", () => {
  it("escapeIlikePattern escapes wildcards", () => {
    expect(escapeIlikePattern("100%_off")).toBe("100\\%\\_off");
  });

  it("normalizeLinkSearchQuery requires at least two characters", () => {
    expect(normalizeLinkSearchQuery("")).toBeNull();
    expect(normalizeLinkSearchQuery("a")).toBeNull();
    expect(normalizeLinkSearchQuery("  ps ")).toBe("ps");
  });

  it("merchantTokensFromBill extracts tokens from bill name", () => {
    const tokens = merchantTokensFromBill(
      "merchant:abc",
      "paypal playstation",
    );
    expect(tokens).toContain("paypal");
    expect(tokens).toContain("playstation");
    expect(tokens).not.toContain("merchant");
  });
});
