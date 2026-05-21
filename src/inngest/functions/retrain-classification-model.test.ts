import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLimit = vi.fn();
const mockOrderBy = vi.fn();
const mockWhere = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: (...args: unknown[]) => {
        mockFrom(...args);
        return {
          where: (...args: unknown[]) => {
            mockWhere(...args);
            return {
              orderBy: (...args: unknown[]) => {
                mockOrderBy(...args);
                return { limit: (...args: unknown[]) => mockLimit(...args) };
              },
            };
          },
        };
      },
    })),
  },
}));

import {
  loadTrainingRowsForHousehold,
  MAX_TRAINING_ROWS,
} from "@/inngest/functions/retrain-classification-model";

describe("loadTrainingRowsForHousehold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue([]);
  });

  it("caps training rows at MAX_TRAINING_ROWS", async () => {
    await loadTrainingRowsForHousehold("hh-1");

    expect(mockLimit).toHaveBeenCalledWith(MAX_TRAINING_ROWS);
    expect(MAX_TRAINING_ROWS).toBe(5_000);
  });
});
