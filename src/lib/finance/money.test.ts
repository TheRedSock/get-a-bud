import {
  parseMoneyToCents,
  decimalStringToCents,
  formatCents,
  formatCentsDecimal,
  centsToDecimalString,
  addCents,
  negateCents,
  isZeroCents,
  absCents,
  moneyPreprocessor,
} from "./money";

describe("parseMoneyToCents", () => {
  describe("dot decimal separator", () => {
    it("parses simple decimal", () => {
      expect(parseMoneyToCents("1234.56")).toBe(123456);
    });

    it("parses single digit cents", () => {
      expect(parseMoneyToCents("0.5")).toBe(50);
    });

    it("parses whole number", () => {
      expect(parseMoneyToCents("100")).toBe(10000);
    });

    it("parses zero", () => {
      expect(parseMoneyToCents("0")).toBe(0);
      expect(parseMoneyToCents("0.00")).toBe(0);
    });

    it("parses with thousands comma separator", () => {
      expect(parseMoneyToCents("1,234.56")).toBe(123456);
      expect(parseMoneyToCents("1,000,000.00")).toBe(100000000);
    });
  });

  describe("comma decimal separator (European)", () => {
    it("parses simple decimal", () => {
      expect(parseMoneyToCents("1234,56")).toBe(123456);
    });

    it("parses with dot thousands separator", () => {
      expect(parseMoneyToCents("1.234,56")).toBe(123456);
    });

    it("parses with space thousands separator", () => {
      expect(parseMoneyToCents("1 234,56")).toBe(123456);
    });

    it("parses large value with European format", () => {
      expect(parseMoneyToCents("1.000.000,00")).toBe(100000000);
    });
  });

  describe("negative values", () => {
    it("parses negative with dot decimal", () => {
      expect(parseMoneyToCents("-99.90")).toBe(-9990);
    });

    it("parses negative with comma decimal", () => {
      expect(parseMoneyToCents("-99,90")).toBe(-9990);
    });

    it("parses negative whole number", () => {
      expect(parseMoneyToCents("-100")).toBe(-10000);
    });

    it("parses negative zero", () => {
      expect(parseMoneyToCents("-0.00")).toBe(0);
    });
  });

  describe("number input", () => {
    it("converts number as major units to cents", () => {
      expect(parseMoneyToCents(12.34)).toBe(1234);
    });

    it("handles whole number input", () => {
      expect(parseMoneyToCents(100)).toBe(10000);
    });

    it("handles negative number", () => {
      expect(parseMoneyToCents(-5.5)).toBe(-550);
    });

    it("handles zero", () => {
      expect(parseMoneyToCents(0)).toBe(0);
    });

    it("throws on NaN", () => {
      expect(() => parseMoneyToCents(NaN)).toThrow("Invalid money value");
    });

    it("throws on Infinity", () => {
      expect(() => parseMoneyToCents(Infinity)).toThrow("Invalid money value");
    });
  });

  describe("edge cases", () => {
    it("handles whitespace around value", () => {
      expect(parseMoneyToCents("  1234.56  ")).toBe(123456);
    });

    it("handles values with only cents", () => {
      expect(parseMoneyToCents("0.01")).toBe(1);
    });

    it("throws on empty string", () => {
      expect(() => parseMoneyToCents("")).toThrow("Invalid money value");
    });

    it("throws on just a minus sign", () => {
      expect(() => parseMoneyToCents("-")).toThrow("Invalid money value");
    });

    it("throws on non-numeric string", () => {
      expect(() => parseMoneyToCents("abc")).toThrow("Invalid money value");
    });

    it("throws on mixed garbage", () => {
      expect(() => parseMoneyToCents("12.34.56.78")).toThrow(
        "Invalid money value",
      );
    });
  });

  describe("large values", () => {
    it("handles large values within safe integer range", () => {
      // 50 million in cents = 5_000_000_000 (within safe integer)
      expect(parseMoneyToCents("50000000.00")).toBe(5000000000);
    });

    it("throws on values exceeding safe integer range", () => {
      // Number.MAX_SAFE_INTEGER = 9_007_199_254_740_991
      // That's 90,071,992,547,409.91 in major units
      expect(() =>
        parseMoneyToCents("90071992547410.00"),
      ).toThrow("exceeds safe integer range");
    });
  });
});

describe("decimalStringToCents", () => {
  it("converts simple decimal", () => {
    expect(decimalStringToCents("1234.56")).toBe(123456);
  });

  it("converts whole number", () => {
    expect(decimalStringToCents("100")).toBe(10000);
  });

  it("converts single decimal digit", () => {
    expect(decimalStringToCents("1.5")).toBe(150);
  });

  it("converts negative", () => {
    expect(decimalStringToCents("-50.25")).toBe(-5025);
  });

  it("rounds >2 decimal places with banker's rounding (round up)", () => {
    // 1.236 → round to 1.24 (third digit 6 > 5)
    expect(decimalStringToCents("1.236")).toBe(124);
  });

  it("rounds >2 decimal places with banker's rounding (round down)", () => {
    // 1.234 → round to 1.23 (third digit 4 < 5)
    expect(decimalStringToCents("1.234")).toBe(123);
  });

  it("rounds exactly half to even (even case)", () => {
    // 1.225 → 1.22 (2 is already even)
    expect(decimalStringToCents("1.225")).toBe(122);
  });

  it("rounds exactly half to even (odd case)", () => {
    // 1.235 → 1.24 (3 is odd, round up)
    expect(decimalStringToCents("1.235")).toBe(124);
  });

  it("rounds half with trailing zeros to even", () => {
    // 1.2350 → not exactly half (trailing matters for detection),
    // but our implementation checks remaining digits after position 2
    expect(decimalStringToCents("1.2350")).toBe(124);
  });

  it("throws on invalid input", () => {
    expect(() => decimalStringToCents("abc")).toThrow();
    expect(() => decimalStringToCents("")).toThrow();
  });
});

describe("formatCents", () => {
  it("formats positive cents to NOK", () => {
    const result = formatCents(123456, "NOK", "nb-NO");
    // 123456 cents = 1234.56 major units, rounded to 1235 with 0 decimals
    expect(result).toMatch(/1[\s\u00a0.,]?235/);
  });

  it("formats zero", () => {
    const result = formatCents(0, "NOK", "nb-NO");
    expect(result).toMatch(/0/);
  });

  it("formats negative cents", () => {
    const result = formatCents(-5000, "NOK", "nb-NO");
    expect(result).toMatch(/50/);
    // Norwegian locale uses Unicode minus (U+2212) not ASCII hyphen
    expect(result).toMatch(/[-\u2212]/);
  });

  it("uses different currencies", () => {
    const result = formatCents(1000, "USD", "en-US");
    expect(result).toContain("$");
    expect(result).toMatch(/10/);
  });
});

describe("formatCentsDecimal", () => {
  it("formats with decimal places", () => {
    const result = formatCentsDecimal(12345, "NOK", "nb-NO");
    // Should show 123.45 or 123,45 depending on locale
    expect(result).toMatch(/123[.,]45/);
  });
});

describe("centsToDecimalString", () => {
  it("converts positive cents to decimal string", () => {
    expect(centsToDecimalString(123456)).toBe("1234.56");
  });

  it("converts zero", () => {
    expect(centsToDecimalString(0)).toBe("0.00");
  });

  it("converts negative cents", () => {
    expect(centsToDecimalString(-9990)).toBe("-99.90");
  });

  it("converts small value", () => {
    expect(centsToDecimalString(1)).toBe("0.01");
  });

  it("converts value with zero fractional", () => {
    expect(centsToDecimalString(10000)).toBe("100.00");
  });

  it("converts single-digit cents", () => {
    expect(centsToDecimalString(5)).toBe("0.05");
  });
});

describe("addCents", () => {
  it("adds multiple values", () => {
    expect(addCents(100, 200, 300)).toBe(600);
  });

  it("handles negative values", () => {
    expect(addCents(1000, -500)).toBe(500);
  });

  it("returns 0 for no arguments", () => {
    expect(addCents()).toBe(0);
  });

  it("handles single argument", () => {
    expect(addCents(42)).toBe(42);
  });

  it("handles array spread", () => {
    const values = [100, 200, 300, 400, 500];
    expect(addCents(...values)).toBe(1500);
  });
});

describe("negateCents", () => {
  it("negates positive", () => {
    expect(negateCents(100)).toBe(-100);
  });

  it("negates negative", () => {
    expect(negateCents(-100)).toBe(100);
  });

  it("returns 0 for 0", () => {
    expect(negateCents(0)).toBe(0);
  });
});

describe("isZeroCents", () => {
  it("returns true for 0", () => {
    expect(isZeroCents(0)).toBe(true);
  });

  it("returns false for positive", () => {
    expect(isZeroCents(1)).toBe(false);
  });

  it("returns false for negative", () => {
    expect(isZeroCents(-1)).toBe(false);
  });
});

describe("absCents", () => {
  it("returns positive for negative", () => {
    expect(absCents(-500)).toBe(500);
  });

  it("returns same for positive", () => {
    expect(absCents(500)).toBe(500);
  });

  it("returns 0 for 0", () => {
    expect(absCents(0)).toBe(0);
  });
});

describe("moneyPreprocessor", () => {
  it("converts string to cents", () => {
    expect(moneyPreprocessor("12.34")).toBe(1234);
  });

  it("converts number to cents", () => {
    expect(moneyPreprocessor(12.34)).toBe(1234);
  });

  it("returns undefined for empty string", () => {
    expect(moneyPreprocessor("")).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(moneyPreprocessor(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(moneyPreprocessor(undefined)).toBeUndefined();
  });

  it("handles European format", () => {
    expect(moneyPreprocessor("1.234,56")).toBe(123456);
  });
});
