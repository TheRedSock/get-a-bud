import { describe, expect, it } from "vitest";

import {
  buildBillCategoryTransactionPatch,
  buildBillDescriptionTransactionPatch,
  canBillOverrideTransactionCategory,
  canBillOverrideTransactionDescription,
  mergeBillTransactionPatches,
} from "./transaction-enrichment";

const baseRow = {
  id: "txn-1",
  categoryId: null,
  categorySource: null,
  suggestedCategoryId: null,
  description: "SPOTIFY AB",
  suggestedDescription: null,
  merchantName: "Spotify",
  metadata: null,
};

describe("canBillOverrideTransactionCategory", () => {
  it("returns false for user-labeled transactions", () => {
    expect(
      canBillOverrideTransactionCategory({
        ...baseRow,
        categoryId: "cat-1",
        categorySource: "user",
      }),
    ).toBe(false);
  });

  it("returns true for pending suggestions", () => {
    expect(
      canBillOverrideTransactionCategory({
        ...baseRow,
        suggestedCategoryId: "cat-suggest",
      }),
    ).toBe(true);
  });

  it("returns true for unapproved auto-labeled categories", () => {
    expect(
      canBillOverrideTransactionCategory({
        ...baseRow,
        categoryId: "cat-auto",
        categorySource: "model",
      }),
    ).toBe(true);
  });
});

describe("canBillOverrideTransactionDescription", () => {
  it("returns false when the user edited the description", () => {
    expect(
      canBillOverrideTransactionDescription({
        categorySource: null,
        metadata: { userEdits: { descriptionEdited: true } },
      }),
    ).toBe(false);
  });

  it("returns false for user-confirmed transactions", () => {
    expect(
      canBillOverrideTransactionDescription({
        categorySource: "user",
        metadata: null,
      }),
    ).toBe(false);
  });

  it("returns true for provider descriptions on unconfirmed rows", () => {
    expect(
      canBillOverrideTransactionDescription({
        categorySource: "model",
        metadata: {
          autoLabel: {
            appliedDescription: "Relabeled",
            originalDescription: "SPOTIFY AB",
            undone: false,
          } as never,
        },
      }),
    ).toBe(true);
  });
});

describe("buildBillCategoryTransactionPatch", () => {
  it("clears suggestion fields when applying bill category", () => {
    expect(
      buildBillCategoryTransactionPatch("cat-bill", {
        ...baseRow,
        suggestedCategoryId: "cat-suggest",
        suggestedDescription: "Spotify Premium",
      }),
    ).toEqual({
      categoryId: "cat-bill",
      categorySource: "user",
      categoryConfidence: "1.00",
      suggestedCategoryId: null,
      suggestedDescription: null,
      suggestedMerchantName: null,
      updatedAt: expect.any(Date),
    });
  });
});

describe("buildBillDescriptionTransactionPatch", () => {
  it("applies the bill name as description", () => {
    expect(
      buildBillDescriptionTransactionPatch("Music League", {
        ...baseRow,
        merchantName: "PayPal",
      }),
    ).toEqual({
      description: "Music League",
      searchText: "Music League PayPal",
      suggestedDescription: null,
      updatedAt: expect.any(Date),
    });
  });
});

describe("mergeBillTransactionPatches", () => {
  it("merges category and description updates", () => {
    const merged = mergeBillTransactionPatches(
      buildBillCategoryTransactionPatch("cat-bill", {
        ...baseRow,
        suggestedCategoryId: "cat-suggest",
      }),
      buildBillDescriptionTransactionPatch("Music League", baseRow),
    );

    expect(merged).toMatchObject({
      categoryId: "cat-bill",
      description: "Music League",
      suggestedCategoryId: null,
      suggestedDescription: null,
    });
  });
});
