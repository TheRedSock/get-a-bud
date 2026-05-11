import {
  mapEnableBankingAccount,
  mapEnableBankingTransaction,
} from "@/lib/ingestion/enable-banking/client";

describe("Enable Banking mapping", () => {
  it("maps account payloads into normalized ingestion accounts", () => {
    expect(
      mapEnableBankingAccount({
        uid: "account-1",
        name: "Main account",
        currency: "NOK",
        balance: { amount: "123.45", currency: "NOK" },
      }),
    ).toMatchObject({
      providerAccountId: "account-1",
      name: "Main account",
      currency: "NOK",
      balance: "123.45",
      kind: "checking",
    });
  });

  it("uses a safe provider error for malformed accounts", () => {
    expect(() => mapEnableBankingAccount({ name: "Missing id" })).toThrow(
      "Enable Banking account is missing an id",
    );
  });

  it("maps transaction fallback description and date", () => {
    expect(
      mapEnableBankingTransaction(
        {
          transaction_id: "txn-1",
          amount: { amount: "-100", currency: "NOK" },
          booking_date: "2026-05-10",
          remittance_information: ["Groceries"],
        },
        "account-1",
      ),
    ).toMatchObject({
      providerTransactionId: "txn-1",
      providerAccountId: "account-1",
      amount: "-100",
      currency: "NOK",
      date: "2026-05-10",
      description: "Groceries",
    });
  });
});
