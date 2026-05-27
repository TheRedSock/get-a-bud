import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TableAmountCell } from "./table-amount-cell";

describe("TableAmountCell", () => {
  it("renders amount and suffix in separate spans", () => {
    render(<TableAmountCell cents={2000} currency="USD" />);

    expect(screen.getByText("20,00")).toBeInTheDocument();
    expect(screen.getByText("$")).toBeInTheDocument();
  });

  it("uses tabular-nums on the container", () => {
    const { container } = render(<TableAmountCell cents={19900} currency="NOK" />);

    expect(container.firstChild).toHaveClass("tabular-nums");
  });
});
