import { describe, expect, it } from "vitest";

import { buildBillListHref, parseBillSearchParams } from "./filters";

describe("parseBillSearchParams", () => {
  it("defaults to current and dueDate asc", () => {
    expect(parseBillSearchParams({})).toEqual({
      status: "current",
      sort: "dueDate",
      direction: "asc",
    });
  });

  it("accepts pending and active", () => {
    expect(parseBillSearchParams({ status: "pending" }).status).toBe("pending");
    expect(parseBillSearchParams({ status: "active" }).status).toBe("active");
  });

  it("falls back unknown status to current", () => {
    expect(parseBillSearchParams({ status: "bogus" }).status).toBe("current");
  });
});

describe("buildBillListHref", () => {
  it("preserves current without query param", () => {
    expect(buildBillListHref(parseBillSearchParams({}))).toBe("/bills");
  });

  it("builds pending filter link", () => {
    expect(
      buildBillListHref(parseBillSearchParams({}), { status: "pending" }),
    ).toBe("/bills?status=pending");
  });
});
