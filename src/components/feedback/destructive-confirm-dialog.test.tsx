// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DestructiveConfirmDialog } from "@/components/feedback/destructive-confirm-dialog";

describe("DestructiveConfirmDialog", () => {
  it("calls onConfirm when the destructive action is chosen", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <DestructiveConfirmDialog
        description="This cannot be undone."
        open
        title="Delete item?"
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("does not close while pending", async () => {
    const onOpenChange = vi.fn();

    render(
      <DestructiveConfirmDialog
        description="This cannot be undone."
        open
        pending
        title="Delete item?"
        onConfirm={vi.fn()}
        onOpenChange={onOpenChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("shows an inline error message when provided", () => {
    render(
      <DestructiveConfirmDialog
        description="This cannot be undone."
        errorMessage="We could not complete this action. Please try again."
        open
        title="Delete item?"
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not complete this action. Please try again.",
    );
  });

  it("closes when cancel is clicked", async () => {
    const onOpenChange = vi.fn();

    render(
      <DestructiveConfirmDialog
        description="This cannot be undone."
        open
        title="Delete item?"
        onConfirm={vi.fn()}
        onOpenChange={onOpenChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

});
