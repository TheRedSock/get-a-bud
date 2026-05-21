"use client";

import { formatCents } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

type TooltipEntry = {
  name?: string;
  value?: number;
  dataKey?: string | number;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  valueLabel?: (name: string) => string;
};

export function ChartTooltip({
  active,
  payload,
  label,
  valueLabel,
}: ChartTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md",
      )}
    >
      {label ? (
        <p className="mb-1 font-medium text-foreground">{String(label)}</p>
      ) : null}
      <ul className="grid gap-1">
        {payload.map((entry) => {
          const name = entry.name != null ? String(entry.name) : "Value";
          const displayName = valueLabel ? valueLabel(name) : name;

          return (
            <li
              key={`${name}-${String(entry.dataKey)}`}
              className="flex items-center justify-between gap-4 tabular-nums"
            >
              <span className="text-muted-foreground">{displayName}</span>
              <span className="font-semibold">
                {formatCents(Number(entry.value ?? 0))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
