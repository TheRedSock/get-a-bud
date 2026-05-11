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
        details: "Everyday spending",
        currency: "NOK",
        balance: { amount: "123.45", currency: "NOK" },
        cash_account_type: "SVGS",
      }),
    ).toMatchObject({
      providerAccountId: "account-1",
      name: "Everyday spending",
      currency: "NOK",
      balance: "123.45",
      kind: "savings",
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
          transaction_amount: { amount: "100", currency: "NOK" },
          credit_debit_indicator: "DBIT",
          booking_date: "2026-05-10",
          remittance_information: ["Groceries"],
        },
        "account-1",
      ),
    ).toMatchObject({
      providerTransactionId: "txn-1",
      providerAccountId: "account-1",
      amount: "-100.00",
      currency: "NOK",
      date: "2026-05-10",
      description: "Groceries",
    });
  });

  it("keeps credited transaction amounts positive", () => {
    expect(
      mapEnableBankingTransaction(
        {
          transaction_id: "txn-2",
          transaction_amount: { amount: "420.1", currency: "NOK" },
          credit_debit_indicator: "CRDT",
          value_date: "2026-05-11",
          bank_transaction_code: { description: "Incoming transfer" },
        },
        "account-1",
      ),
    ).toMatchObject({
      amount: "420.10",
      currency: "NOK",
      description: "Incoming transfer",
    });
  });
});
