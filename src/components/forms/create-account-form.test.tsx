// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { refreshMock } from "@/test/mocks/next-navigation";
import { toastSuccessMock } from "@/test/mocks/sonner";

vi.mock("@/app/(app)/accounts/actions", () => ({
  createAccount: vi.fn(),
}));

describe("CreateAccountForm", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a field error when name is empty on blur", async () => {
    const { CreateAccountForm } = await import(
      "@/components/forms/create-account-form"
    );

    const view = render(<CreateAccountForm />);

    const name = within(view.container).getByLabelText("Name");
    await userEvent.type(name, "x");
    await userEvent.clear(name);
    await userEvent.tab();

    await waitFor(() => {
      expect(name).toHaveAttribute("aria-invalid", "true");
    });
  });

  it("submits a valid account and resets the form", async () => {
    const { createAccount } = await import("@/app/(app)/accounts/actions");
    const createAccountMock = vi.mocked(createAccount);
    createAccountMock.mockResolvedValue({
      data: { account: { id: "acc-1" } },
    } as Awaited<ReturnType<typeof createAccount>>);

    const { CreateAccountForm } = await import(
      "@/components/forms/create-account-form"
    );

    const view = render(<CreateAccountForm />);

    await userEvent.type(within(view.container).getByLabelText("Name"), "Savings");
    await userEvent.type(
      within(view.container).getByLabelText("Starting balance"),
      "1000",
    );
    await userEvent.click(
      within(view.container).getByRole("button", { name: "Create account" }),
    );

    await waitFor(() => {
      expect(createAccountMock).toHaveBeenCalled();
      expect(toastSuccessMock).toHaveBeenCalledWith("Account created");
      expect(refreshMock).toHaveBeenCalled();
    });

    expect(within(view.container).getByLabelText("Name")).toHaveValue("");
  });
});
