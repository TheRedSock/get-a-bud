import { describe, expect, it } from "vitest";

import { transactionParamsKey } from "@/lib/ingestion/enable-banking/connection-helpers";
import { SyncRunMetadataCache } from "@/lib/ingestion/enable-banking/metadata";
import { getRunAccountCursor } from "@/lib/ingestion/enable-banking/sync-progress";

describe("getRunAccountCursor", () => {
  it("returns undefined when paramsKey does not match stored cursor", () => {
    const cache = new SyncRunMetadataCache("run-1", {
      enableBanking: {
        accountCursors: {
          "acct-1": {
            continuationKey: "cursor-a",
            paramsKey: transactionParamsKey({
              strategy: "longest",
              transactionStatus: "BOOK",
            }),
          },
        },
      },
    });

    const cursor = getRunAccountCursor(cache, {
      providerAccountId: "acct-1",
      params: {
        strategy: "default",
        dateFrom: "2026-01-01",
        dateTo: "2026-05-01",
        transactionStatus: "BOOK",
      },
    });

    expect(cursor).toBeUndefined();
  });

  it("returns the continuation key when paramsKey matches", () => {
    const params = {
      strategy: "longest" as const,
      transactionStatus: "BOOK" as const,
    };
    const cache = new SyncRunMetadataCache("run-1", {
      enableBanking: {
        accountCursors: {
          "acct-1": {
            continuationKey: "cursor-a",
            paramsKey: transactionParamsKey(params),
          },
        },
      },
    });

    expect(
      getRunAccountCursor(cache, {
        providerAccountId: "acct-1",
        params,
      }),
    ).toBe("cursor-a");
  });
});
