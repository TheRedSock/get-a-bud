import {
  firstCommaSegment,
  parseDateByPattern,
  parseLocalizedNumber,
  toLocaleDisplayName,
} from "./normalization";

describe("import normalization helpers", () => {
  it("parses explicit date patterns", () => {
    expect(parseDateByPattern("10.04.2026", "DD.MM.YYYY")).toBe("2026-04-10");
    expect(parseDateByPattern("2026-04-10", "YYYY-MM-DD")).toBe("2026-04-10");
    expect(parseDateByPattern("04/10/2026", "DD.MM.YYYY")).toBeNull();
  });

  it("parses dot and comma decimal amounts", () => {
    expect(parseLocalizedNumber("593.16")).toBe(593.16);
    expect(parseLocalizedNumber("1.234,56")).toBe(1234.56);
    expect(parseLocalizedNumber("1 234,56")).toBe(1234.56);
  });

  it("normalizes display names without DNB-specific assumptions", () => {
    expect(toLocaleDisplayName("ÅPENT BAKERI KV")).toBe("Åpent Bakeri Kv");
    expect(firstCommaSegment("KIWI 425 RØDTVE, Oslo")).toBe("KIWI 425 RØDTVE");
  });
});
