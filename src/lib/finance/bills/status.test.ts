import { describe, expect, it } from "vitest";

import { isBillPastEndThreshold } from "./status";

describe("isBillPastEndThreshold", () => {
  const asOf = new Date("2025-06-01T12:00:00Z");

  it("returns true when monthly bill is overdue by more than 2× period", () => {
    expect(
      isBillPastEndThreshold({
        lastPaymentDate: "2025-01-01",
        cadence: "monthly",
        asOf,
      }),
    ).toBe(true);
  });

  it("returns false when monthly bill is overdue by 1.5× period only", () => {
    expect(
      isBillPastEndThreshold({
        lastPaymentDate: "2025-04-20",
        cadence: "monthly",
        asOf,
      }),
    ).toBe(false);
  });

  it("handles weekly cadence", () => {
    expect(
      isBillPastEndThreshold({
        lastPaymentDate: "2025-04-01",
        cadence: "weekly",
        asOf,
      }),
    ).toBe(true);
  });

  it("handles yearly cadence", () => {
    expect(
      isBillPastEndThreshold({
        lastPaymentDate: "2023-01-01",
        cadence: "yearly",
        asOf,
      }),
    ).toBe(true);
  });

  it("never auto-ends unknown cadence", () => {
    expect(
      isBillPastEndThreshold({
        lastPaymentDate: "2020-01-01",
        cadence: "unknown",
        asOf,
      }),
    ).toBe(false);
  });
});
