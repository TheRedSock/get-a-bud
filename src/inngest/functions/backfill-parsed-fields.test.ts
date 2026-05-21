import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

import {
  applyBackfillBatch,
  loadBackfillBatch,
  type BackfillRow,
} from "@/inngest/functions/backfill-parsed-fields";
import { backfillParsedFieldsSchema } from "@/inngest/lib/event-validation";

function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

describe("backfillParsedFields batch helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
  });

  it("requires householdId in the event schema", () => {
    expect(
      backfillParsedFieldsSchema.safeParse({ householdId: "hh-1" }).success,
    ).toBe(true);
    expect(backfillParsedFieldsSchema.safeParse({ afterId: "tx-1" }).success).toBe(
      false,
    );
  });

  it("scopes loadBackfillBatch by household and afterId cursor", async () => {
    mockSelect.mockReturnValue(selectChain([]));

    await loadBackfillBatch({
      householdId: "hh-1",
      afterId: "tx-cursor",
      batchSize: 10,
    });

    expect(mockSelect).toHaveBeenCalled();
    const chain = mockSelect.mock.results[0]?.value;
    expect(chain.limit).toHaveBeenCalledWith(10);
  });

  it("only updates rows that still lack parserSource", async () => {
    const rows: BackfillRow[] = [
      {
        id: "tx-1",
        description: "Varekjøp, Kl. 17.25, Kiwi 425",
        source: "enable_banking",
        merchantName: null,
        originalCurrency: null,
        metadata: null,
      },
    ];

    await applyBackfillBatch(rows);

    expect(mockUpdate).toHaveBeenCalled();
    const setFn = mockUpdate.mock.results[0]?.value.set;
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        parserSource: expect.stringMatching(/^(norwegian|none)$/),
      }),
    );
    const whereFn = mockUpdate.mock.results[0]?.value.set.mock.results[0]?.value
      .where;
    expect(whereFn).toHaveBeenCalled();
  });
});
