import { describe, expect, it } from "vitest";

import { PAGE_SIZE } from "./queries";

describe("transaction query contracts", () => {
  it("enforces a bounded page size for list pagination", () => {
    expect(PAGE_SIZE).toBeGreaterThan(0);
    expect(PAGE_SIZE).toBeLessThanOrEqual(100);
  });
});
