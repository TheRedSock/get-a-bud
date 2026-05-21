// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { refreshMock } from "@/test/mocks/next-navigation";
import { toastSuccessMock } from "@/test/mocks/sonner";

vi.mock("@/app/(app)/net-worth/actions", () => ({
  createAsset: vi.fn(),
  createLiability: vi.fn(),
}));

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

    // Use fireEvent for the blur-validation assertion. The discriminated union
    // form re-renders on change, which can detach the DOM node between
    // userEvent calls in CI (jsdom on Linux).
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

    await userEvent.type(within(view.container).getByLabelText("Name"), "Apartment");
    await userEvent.type(within(view.container).getByLabelText("Value"), "2500000");
    await userEvent.click(
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
