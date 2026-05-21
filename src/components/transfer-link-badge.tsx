import { ArrowRightLeft, CircleHelp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/finance/money";
import type { TransferSummary } from "@/lib/finance/transactions";
import { cn } from "@/lib/utils";

export function TransferLinkBadge({
  summary,
  variant = "default",
}: {
  summary?: TransferSummary | null;
  variant?: "default" | "icon";
}) {
  if (!summary) {
    return null;
  }

  const counterpart = summary.counterpart
    ? `${summary.counterpart.accountName}, ${summary.counterpart.date}, ${formatCents(
        summary.counterpart.amountCents,
        summary.counterpart.currency,
      )}`
    : "Counterpart not visible";

  const title = `${summary.confirmed ? "Linked transfer" : "Transfer link needs review"}: ${counterpart}`;

  const confirmedStyles =
    "inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-info/30 bg-info/10 text-info";
  const reviewStyles =
    "inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-warning/30 bg-warning/10 text-warning-foreground";

  if (variant === "icon") {
    return (
      <span
        className={summary.confirmed ? confirmedStyles : reviewStyles}
        title={title}
      >
        {summary.confirmed ? (
          <ArrowRightLeft className="size-3.5" aria-hidden />
        ) : (
          <CircleHelp className="size-3.5" aria-hidden />
        )}
        <span className="sr-only">{title}</span>
      </span>
    );
  }

  return (
    <Badge
      className={cn(
        "gap-1",
        summary.confirmed
          ? "border-info/30 bg-info/10 text-info"
          : "border-warning/30 bg-warning/10 text-warning-foreground",
      )}
      title={title}
    >
      {summary.confirmed ? (
        <ArrowRightLeft className="size-3.5" />
      ) : (
        <CircleHelp className="size-3.5" />
      )}
      {summary.confirmed ? "Transfer" : "Review transfer"}
    </Badge>
  );
}
