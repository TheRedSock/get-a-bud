// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(app)/transactions/actions", () => ({
  updateTransaction: vi.fn(),
}));

const categories = [{ id: "cat-1", name: "Groceries" }];

const baseTransaction = {
  id: "tx-1",
  source: "enable_banking" as const,
  amountCents: -4500,
  currency: "NOK",
  date: "2026-01-15",
  merchantName: "Store",
  description: "Grocery run",
  notes: null,
  metadata: null,
  merchantId: null,
  categoryId: "cat-1",
  categoryName: "Groceries",
  categorySource: "user",
  categoryConfidence: "0.90",
  suggestedCategoryId: null,
  suggestedCategoryName: null,
  suggestedDescription: null,
  suggestedMerchantName: null,
  transactionType: null,
  paymentChannel: null,
  parserSource: null,
  originalAmountCents: null,
  originalCurrency: null,
  linkedTransactionId: null,
  transferGroupId: null,
  isRecurringCandidate: false,
  status: "posted" as const,
  excludedFromBudget: false,
  accountName: "Checking",
  transferSummary: null,
  recurringBill: null,
  classificationState: "user_confirmed" as const,
  undoAutoLabelAvailable: false,
  canEditAmount: false,
  canEditDate: false,
};

describe("TransactionEditor", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("disables amount and date fields for synced transactions in edit mode", async () => {
    const { TransactionEditor } = await import("@/components/transaction-editor");

    const view = render(
      <table>
        <tbody>
          <TransactionEditor
            categories={categories}
            transaction={baseTransaction}
          />
        </tbody>
      </table>,
    );

    await userEvent.click(
      within(view.container).getByRole("button", { name: "Edit transaction" }),
    );

    expect(screen.getByLabelText("Amount")).toBeDisabled();
    expect(screen.getByLabelText("Date")).toBeDisabled();
  });

  it("enables amount and date fields for manual transactions in edit mode", async () => {
    const { TransactionEditor } = await import("@/components/transaction-editor");

    const view = render(
      <table>
        <tbody>
          <TransactionEditor
            categories={categories}
            transaction={{
              ...baseTransaction,
              source: "manual",
              canEditAmount: true,
              canEditDate: true,
            }}
          />
        </tbody>
      </table>,
    );

    await userEvent.click(
      within(view.container).getByRole("button", { name: "Edit transaction" }),
    );

    expect(screen.getByLabelText("Amount")).not.toBeDisabled();
    expect(screen.getByLabelText("Date")).not.toBeDisabled();
  });
});
