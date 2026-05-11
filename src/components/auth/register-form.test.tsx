// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { signInMock } from "@/test/mocks/next-auth-react";
import { toastErrorMock } from "@/test/mocks/sonner";

describe("RegisterForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows the server's human-readable error message", async () => {
    const { RegisterForm } = await import("@/components/auth/register-form");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            ok: false,
            error: {
              code: "conflict",
              message: "An account already exists for that email.",
              requestId: "req_123",
            },
          },
          { status: 409 },
        ),
      ),
    );

    render(<RegisterForm />);

    await userEvent.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct horse");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Could not create account", {
        description: "An account already exists for that email.",
      });
    });
    expect(signInMock).not.toHaveBeenCalled();
  });
});
