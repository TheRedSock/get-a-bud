// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { refreshMock } from "@/test/mocks/next-navigation";
import { toastSuccessMock } from "@/test/mocks/sonner";

vi.mock("@/app/(app)/bills/actions", () => ({
  rejectBill: vi.fn(),
}));

describe("RejectRecurringBillButton", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("rejects a bill and returns focus to the trigger after cancel", async () => {
    const { rejectBill } = await import("@/app/(app)/bills/actions");
    const rejectBillMock = vi.mocked(rejectBill);
    rejectBillMock.mockResolvedValue({
      data: { ignoredTransactions: 0 },
    } as Awaited<ReturnType<typeof rejectBill>>);

    const { RejectRecurringBillButton } = await import(
      "@/components/recurring-bill-actions"
    );

    render(<RejectRecurringBillButton billId="bill-1" />);

    const trigger = screen.getByRole("button", { name: "Reject recurring bill" });
    await userEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });

    expect(rejectBillMock).not.toHaveBeenCalled();
  });

  it("shows an inline error without a toast when rejection fails", async () => {
    const { rejectBill } = await import("@/app/(app)/bills/actions");
    const rejectBillMock = vi.mocked(rejectBill);
    rejectBillMock.mockResolvedValue({
      error: {
        code: "internal",
        message: "Database unavailable.",
      },
    } as Awaited<ReturnType<typeof rejectBill>>);

    const { RejectRecurringBillButton } = await import(
      "@/components/recurring-bill-actions"
    );

    const { toastErrorMock } = await import("@/test/mocks/sonner");

    render(<RejectRecurringBillButton billId="bill-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Reject recurring bill" }));
    await userEvent.click(screen.getByRole("button", { name: "Reject bill" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "We could not reject this bill. Your data is safe — please try again.",
      );
    });

    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("rejects a bill successfully", async () => {
    const { rejectBill } = await import("@/app/(app)/bills/actions");
    const rejectBillMock = vi.mocked(rejectBill);
    rejectBillMock.mockResolvedValue({
      data: { ignoredTransactions: 2 },
    } as Awaited<ReturnType<typeof rejectBill>>);

    const { RejectRecurringBillButton } = await import(
      "@/components/recurring-bill-actions"
    );

    render(<RejectRecurringBillButton billId="bill-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Reject recurring bill" }));
    await userEvent.click(screen.getByRole("button", { name: "Reject bill" }));

    await waitFor(() => {
      expect(rejectBillMock).toHaveBeenCalledWith({ billId: "bill-1" });
      expect(toastSuccessMock).toHaveBeenCalled();
      expect(refreshMock).toHaveBeenCalled();
    });
  });
});
