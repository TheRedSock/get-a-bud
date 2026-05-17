import { ArrowRightLeft, CircleHelp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/finance/money";

export type TransferSummary = {
  groupId: string;
  role: string;
  confidence: string;
  confirmed: boolean;
  counterpart?: {
    accountName: string;
    amountCents: number;
    currency: string;
    date: string;
  } | null;
};

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

  if (variant === "icon") {
    return (
      <span
        className={
          summary.confirmed
            ? "inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-700"
            : "inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700"
        }
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
      className={
        summary.confirmed
          ? "gap-1 border-sky-500/30 bg-sky-500/10 text-sky-700"
          : "gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700"
      }
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
