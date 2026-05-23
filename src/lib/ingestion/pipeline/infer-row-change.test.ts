import { describe, expect, it } from "vitest";

import { inferPipelineRowChange } from "@/lib/ingestion/pipeline/infer-row-change";

describe("inferPipelineRowChange", () => {
  it("returns imported when there is no previous row", () => {
    expect(
      inferPipelineRowChange(undefined, {
        id: "t1",
        categoryId: null,
        suggestedCategoryId: null,
        transferGroupId: null,
      }),
    ).toBe("imported");
  });

  it("returns categorized when category fields change", () => {
    expect(
      inferPipelineRowChange(
        { id: "t1", categoryId: null, suggestedCategoryId: null, transferGroupId: null },
        { id: "t1", categoryId: "c1", suggestedCategoryId: null, transferGroupId: null },
      ),
    ).toBe("categorized");
  });

  it("returns linked when transfer group appears", () => {
    expect(
      inferPipelineRowChange(
        { id: "t1", categoryId: "c1", suggestedCategoryId: null, transferGroupId: null },
        { id: "t1", categoryId: "c1", suggestedCategoryId: null, transferGroupId: "g1" },
      ),
    ).toBe("linked");
  });

  it("returns null when nothing material changed", () => {
    expect(
      inferPipelineRowChange(
        { id: "t1", categoryId: "c1", suggestedCategoryId: null, transferGroupId: null },
        { id: "t1", categoryId: "c1", suggestedCategoryId: null, transferGroupId: null },
      ),
    ).toBeNull();
  });
});
