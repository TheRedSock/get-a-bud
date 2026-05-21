// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { refreshMock } from "@/test/mocks/next-navigation";
import { toastErrorMock, toastSuccessMock } from "@/test/mocks/sonner";

vi.mock("@/app/(app)/transactions/actions", () => ({
  createTransaction: vi.fn(),
}));

const accounts = [{ id: "acc-1", name: "Checking" }];
const categories = [{ id: "cat-1", name: "Groceries" }];

describe("CreateTransactionForm", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a field error when description is cleared on blur", async () => {
    const { CreateTransactionForm } = await import(
      "@/components/forms/create-transaction-form"
    );

    const view = render(
      <CreateTransactionForm accounts={accounts} categories={categories} />,
    );

    // Use fireEvent for blur-validation: userEvent.clear() is unreliable in
    // jsdom CI because RHF re-renders can detach the DOM node between calls.
    const description = within(view.container).getByLabelText("Description");
    fireEvent.change(description, { target: { value: "x" } });
    fireEvent.change(description, { target: { value: "" } });
    fireEvent.blur(description);

    await waitFor(() => {
      expect(
        within(view.container).getByLabelText("Description"),
      ).toHaveAttribute("aria-invalid", "true");
    });
  });

  it("submits valid input and resets the form", async () => {
    const { createTransaction } = await import(
      "@/app/(app)/transactions/actions"
    );
    const createTransactionMock = vi.mocked(createTransaction);
    createTransactionMock.mockResolvedValue({
      data: { transaction: { id: "tx-1" } },
    } as Awaited<ReturnType<typeof createTransaction>>);

    const { CreateTransactionForm } = await import(
      "@/components/forms/create-transaction-form"
    );

    const view = render(
      <CreateTransactionForm accounts={accounts} categories={categories} />,
    );

    await userEvent.type(within(view.container).getByLabelText("Description"), "Coffee");
    await userEvent.type(within(view.container).getByLabelText("Amount"), "45.50");
    await userEvent.click(
      within(view.container).getByRole("button", { name: "Create transaction" }),
    );

    await waitFor(() => {
      expect(createTransactionMock).toHaveBeenCalled();
      expect(toastSuccessMock).toHaveBeenCalled();
      expect(refreshMock).toHaveBeenCalled();
    });

    expect(within(view.container).getByLabelText("Description")).toHaveValue("");
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("shows a human-readable toast when the server returns an error", async () => {
    const { createTransaction } = await import(
      "@/app/(app)/transactions/actions"
    );
    const createTransactionMock = vi.mocked(createTransaction);
    createTransactionMock.mockResolvedValue({
      error: {
        code: "not_found",
        message: "Choose an account from this household.",
      },
    });

    const { CreateTransactionForm } = await import(
      "@/components/forms/create-transaction-form"
    );

    const view = render(
      <CreateTransactionForm accounts={accounts} categories={categories} />,
    );

    await userEvent.type(within(view.container).getByLabelText("Description"), "Rent");
    await userEvent.type(within(view.container).getByLabelText("Amount"), "1200");
    await userEvent.click(
      within(view.container).getByRole("button", { name: "Create transaction" }),
    );

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Could not create transaction", {
        description: "Choose an account from this household.",
      });
    });
  });
});
