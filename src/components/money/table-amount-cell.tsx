import { formatCentsParts } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

export const TABLE_AMOUNT_SYMBOL_SLOT = "w-[2.75rem]";

type TableAmountCellProps = {
  cents: number;
  currency?: string;
  locale?: string;
  className?: string;
};

export function TableAmountCell({
  cents,
  currency = "NOK",
  locale = "nb-NO",
  className,
}: TableAmountCellProps) {
  const { amount, suffix } = formatCentsParts(cents, currency, locale);

  return (
    <div
      className={cn("flex justify-end font-semibold tabular-nums", className)}
    >
      <span>{amount}</span>
      <span
        className={cn(
          TABLE_AMOUNT_SYMBOL_SLOT,
          "shrink-0 pl-0.5 text-left font-semibold",
        )}
      >
        {suffix}
      </span>
    </div>
  );
}
