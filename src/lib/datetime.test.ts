import { describe, expect, it } from "vitest";

import { formatAppDate, formatAppDateTime } from "./datetime";

describe("formatAppDateTime", () => {
  it("uses en-US regardless of runtime default locale", () => {
    const value = "2026-05-25T08:01:27.000Z";
    expect(formatAppDateTime(value)).toBe(
      new Date(value).toLocaleString("en-US", {
        dateStyle: "short",
        timeStyle: "medium",
      }),
    );
  });
});

describe("formatAppDate", () => {
  it("uses en-US medium date style", () => {
    expect(formatAppDate("2026-05-25T12:00:00.000Z")).toBe("May 25, 2026");
  });
});
