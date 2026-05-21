// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { refreshMock } from "@/test/mocks/next-navigation";
import { toastSuccessMock } from "@/test/mocks/sonner";

vi.mock("@/app/(app)/budgets/actions", () => ({
  createBudget: vi.fn(),
}));

describe("CreateBudgetForm", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a field error when name is empty on blur", async () => {
    const { CreateBudgetForm } = await import(
      "@/components/forms/create-budget-form"
    );

    const view = render(<CreateBudgetForm />);

    // Use fireEvent for blur-validation: userEvent.clear() is unreliable in
    // jsdom CI because RHF re-renders can detach the DOM node between calls.
    const name = within(view.container).getByLabelText("Name");
    fireEvent.change(name, { target: { value: "x" } });
    fireEvent.change(name, { target: { value: "" } });
    fireEvent.blur(name);

    await waitFor(() => {
      expect(
        within(view.container).getByLabelText("Name"),
      ).toHaveAttribute("aria-invalid", "true");
    });
  });

  it("submits a valid budget and resets the form", async () => {
    const { createBudget } = await import("@/app/(app)/budgets/actions");
    const createBudgetMock = vi.mocked(createBudget);
    createBudgetMock.mockResolvedValue({
      data: { budget: { id: "budget-1" } },
    } as Awaited<ReturnType<typeof createBudget>>);

    const { CreateBudgetForm } = await import(
      "@/components/forms/create-budget-form"
    );

    const view = render(<CreateBudgetForm />);

    await userEvent.type(within(view.container).getByLabelText("Name"), "Household");
    await userEvent.click(
      within(view.container).getByRole("button", { name: "Create budget" }),
    );

    await waitFor(() => {
      expect(createBudgetMock).toHaveBeenCalled();
      expect(toastSuccessMock).toHaveBeenCalledWith("Budget created");
      expect(refreshMock).toHaveBeenCalled();
    });

    expect(within(view.container).getByLabelText("Name")).toHaveValue("");
  });
});
