import { TableAmountCell } from "@/components/money/table-amount-cell";
import {
  billAmountCentsAndCurrency,
  type BillAmountDisplay,
} from "@/lib/finance/bills/display";

type BillTableAmountCellProps = {
  bill: BillAmountDisplay;
  className?: string;
};

export function BillTableAmountCell({ bill, className }: BillTableAmountCellProps) {
  const { cents, currency } = billAmountCentsAndCurrency(bill);
  return (
    <TableAmountCell cents={cents} currency={currency} className={className} />
  );
}
