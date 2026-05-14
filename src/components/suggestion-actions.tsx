"use client";

import { Check, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { parseApiResponse } from "@/lib/api-client";
import { showErrorToast } from "@/lib/toast-errors";

type Action = "approve" | "reject";

export function SuggestionActions({
  transactionId,
}: {
  transactionId: string;
}) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<Action | null>(null);

  async function submit(action: Action) {
    setLoadingAction(action);

    try {
      const response = await fetch(
        `/api/transactions/${transactionId}/${action}-suggestion`,
        { method: "POST" },
      );
      await parseApiResponse(response);
      toast.success(
        action === "approve" ? "Suggestion approved" : "Suggestion rejected",
      );
      router.refresh();
    } catch (error) {
      showErrorToast(
        action === "approve"
          ? "Could not approve suggestion"
          : "Could not reject suggestion",
        error,
      );
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        disabled={loadingAction !== null}
        size="sm"
        type="button"
        onClick={() => void submit("approve")}
      >
        {loadingAction === "approve" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Check className="size-4" />
        )}
        Approve
      </Button>
      <Button
        disabled={loadingAction !== null}
        size="sm"
        type="button"
        variant="outline"
        onClick={() => void submit("reject")}
      >
        {loadingAction === "reject" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <X className="size-4" />
        )}
        Reject
      </Button>
    </div>
  );
}
