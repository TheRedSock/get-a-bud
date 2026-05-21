// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { refreshMock } from "@/test/mocks/next-navigation";
import { toastSuccessMock } from "@/test/mocks/sonner";

vi.mock("@/app/(app)/net-worth/actions", () => ({
  createAsset: vi.fn(),
  createLiability: vi.fn(),
}));

// jsdom does not compute CSS reliably; pointer-events checks produce false
// positives on some platforms (Linux CI). Disable for this form's tests.
const user = userEvent.setup({ pointerEventsCheck: 0 });

describe("CreateNetWorthItemForm", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a field error when the asset name is cleared on blur", async () => {
    const { CreateNetWorthItemForm } = await import(
      "@/components/forms/create-net-worth-item-form"
    );

    const view = render(<CreateNetWorthItemForm />);

    const name = within(view.container).getByLabelText("Name");
    await user.type(name, "x");
    await user.clear(name);
    await user.tab();

    await waitFor(() => {
      expect(name).toHaveAttribute("aria-invalid", "true");
    });
  });

  it("submits a valid asset and resets the form", async () => {
    const { createAsset } = await import("@/app/(app)/net-worth/actions");
    const createAssetMock = vi.mocked(createAsset);
    createAssetMock.mockResolvedValue({
      data: { asset: { id: "asset-1" } },
    } as Awaited<ReturnType<typeof createAsset>>);

    const { CreateNetWorthItemForm } = await import(
      "@/components/forms/create-net-worth-item-form"
    );

    const view = render(<CreateNetWorthItemForm />);

    await user.type(within(view.container).getByLabelText("Name"), "Apartment");
    await user.type(within(view.container).getByLabelText("Value"), "2500000");
    await user.click(
      within(view.container).getByRole("button", { name: "Create asset" }),
    );

    await waitFor(() => {
      expect(createAssetMock).toHaveBeenCalled();
      expect(toastSuccessMock).toHaveBeenCalledWith("Asset created");
      expect(refreshMock).toHaveBeenCalled();
    });

    expect(within(view.container).getByLabelText("Name")).toHaveValue("");
  });
});
