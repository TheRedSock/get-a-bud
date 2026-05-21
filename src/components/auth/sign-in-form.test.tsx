// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { signInMock } from "@/test/mocks/next-auth-react";
import { toastErrorMock } from "@/test/mocks/sonner";

describe("SignInForm", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a field error when email is cleared on blur", async () => {
    const { SignInForm } = await import("@/components/auth/sign-in-form");

    const view = render(<SignInForm />);

    const email = within(view.container).getByLabelText("Email");
    await userEvent.click(email);
    await userEvent.type(email, "a");
    await userEvent.clear(email);
    await userEvent.tab();

    await waitFor(() => {
      expect(email).toHaveAttribute("aria-invalid", "true");
    });
  });

  it("shows a toast when credentials are rejected", async () => {
    signInMock.mockResolvedValue({ error: "CredentialsSignin" });

    const { SignInForm } = await import("@/components/auth/sign-in-form");

    render(<SignInForm />);

    await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Could not sign in", {
        description: "Check your email and password and try again.",
      });
    });
  });
});
