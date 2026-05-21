import { describe, expect, it, vi } from "vitest";

import {
  parseConnectionMetadata,
  parseEnableBankingSyncMetadata,
  parseTransactionMetadata,
  requireConnectionMetadata,
} from "@/lib/ingestion/enable-banking/metadata-schemas";

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn() },
}));

describe("metadata schema parsing", () => {
  it("parses valid sync run metadata", () => {
    const parsed = parseEnableBankingSyncMetadata(
      {
        enableBanking: {
          progress: { importedAccounts: 2, importedTransactions: 10 },
        },
      },
      { syncRunId: "run-1" },
    );

    expect(parsed.enableBanking?.progress?.importedAccounts).toBe(2);
  });

  it("returns empty object for corrupt sync run metadata", () => {
    const parsed = parseEnableBankingSyncMetadata(
      { enableBanking: { transactionParams: { strategy: "invalid" } } },
      { syncRunId: "run-1" },
    );

    expect(parsed).toEqual({});
  });

  it("parses connection metadata with psu headers", () => {
    const parsed = parseConnectionMetadata(
      {
        psuHeaders: { "X-IP-Address": "127.0.0.1" },
        enableBanking: { initialTransactionSyncCompleted: true },
      },
      { connectionId: "conn-1" },
    );

    expect(parsed.enableBanking?.initialTransactionSyncCompleted).toBe(true);
    expect(
      (parsed.psuHeaders as Record<string, string> | undefined)?.["X-IP-Address"],
    ).toBe("127.0.0.1");
  });

  it("throws when strict connection metadata is required but invalid", () => {
    expect(() =>
      requireConnectionMetadata(
        { enableBanking: { initialTransactionSyncCompleted: "yes" } },
        { connectionId: "conn-1" },
      ),
    ).toThrow();
  });

  it("returns empty object for corrupt transaction metadata", () => {
    const parsed = parseTransactionMetadata(
      { parsed: { transactionType: 123 } },
      { transactionId: "txn-1" },
    );

    expect(parsed).toEqual({});
  });
});
