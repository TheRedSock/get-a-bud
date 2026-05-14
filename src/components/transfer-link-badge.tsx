import { ArrowRightLeft, CircleHelp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/utils";

export type TransferSummary = {
  groupId: string;
  role: string;
  confidence: string;
  confirmed: boolean;
  counterpart?: {
    accountName: string;
    amount: string;
    currency: string;
    date: string;
  } | null;
};

export function TransferLinkBadge({
  summary,
}: {
  summary?: TransferSummary | null;
}) {
  if (!summary) {
    return null;
  }

  const counterpart = summary.counterpart
    ? `${summary.counterpart.accountName}, ${summary.counterpart.date}, ${formatMoney(
        Number(summary.counterpart.amount),
        summary.counterpart.currency,
      )}`
    : "Counterpart not visible";

  return (
    <Badge
      className={
        summary.confirmed
          ? "gap-1 border-sky-500/30 bg-sky-500/10 text-sky-700"
          : "gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700"
      }
      title={`${summary.confirmed ? "Linked transfer" : "Transfer link needs review"}: ${counterpart}`}
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
