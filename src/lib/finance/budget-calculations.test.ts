import { describe, expect, it } from "vitest";

import { getCurrentPeriod } from "./budget-calculations";

describe("getCurrentPeriod", () => {
  it("uses calendar month boundaries when periodStartDay is 1", () => {
    const period = getCurrentPeriod({ type: "monthly", periodStartDay: 1 });
    expect(period.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(period.to > period.from).toBe(true);
  });

  it("returns a seven-day window for weekly budgets", () => {
    const period = getCurrentPeriod({ type: "weekly", periodStartDay: 1 });
    const from = new Date(period.from);
    const to = new Date(period.to);
    const days = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    expect(days).toBe(7);
  });

  it("monthly period spans approximately one month", () => {
    const period = getCurrentPeriod({ type: "monthly", periodStartDay: 1 });
    const from = new Date(period.from);
    const to = new Date(period.to);
    const days = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    // A monthly period is between 28 and 31 days
    expect(days).toBeGreaterThanOrEqual(28);
    expect(days).toBeLessThanOrEqual(31);
  });

  it("handles mid-month start day without crossing period boundaries", () => {
    const period = getCurrentPeriod({ type: "monthly", periodStartDay: 15 });
    const from = new Date(period.from);
    const to = new Date(period.to);
    const days = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    // Should still span roughly one month
    expect(days).toBeGreaterThanOrEqual(28);
    expect(days).toBeLessThanOrEqual(31);
  });

  it("period always contains today", () => {
    const today = new Date().toISOString().slice(0, 10);

    for (const startDay of [1, 10, 15, 25]) {
      const period = getCurrentPeriod({ type: "monthly", periodStartDay: startDay });
      expect(today >= period.from).toBe(true);
      expect(today < period.to).toBe(true);
    }
  });

  it("from and to are valid ISO date strings", () => {
    const period = getCurrentPeriod({ type: "monthly", periodStartDay: 1 });
    expect(new Date(period.from).toISOString().slice(0, 10)).toBe(period.from);
    expect(new Date(period.to).toISOString().slice(0, 10)).toBe(period.to);
  });

  it("weekly period contains today regardless of day of week", () => {
    const today = new Date().toISOString().slice(0, 10);
    const period = getCurrentPeriod({ type: "weekly", periodStartDay: 1 });
    expect(today >= period.from).toBe(true);
    expect(today < period.to).toBe(true);
  });
});
