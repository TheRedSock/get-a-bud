import { normalizeMerchant } from "@/lib/finance/categorization";

describe("normalizeMerchant", () => {
  it("keeps Nordic letters while normalizing punctuation and whitespace", () => {
    expect(normalizeMerchant("  KIWI Ålesund #123\n")).toBe("kiwi ålesund 123");
  });

  it("collapses noisy payment processor text into searchable words", () => {
    expect(normalizeMerchant("Visa* REMA-1000   OSLO")).toBe("visa rema 1000 oslo");
  });
});
