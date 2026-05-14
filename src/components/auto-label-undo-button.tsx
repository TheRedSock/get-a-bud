"use client";

import { Loader2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { parseApiResponse } from "@/lib/api-client";
import { showErrorToast } from "@/lib/toast-errors";

export function AutoLabelUndoButton({
  transactionId,
}: {
  transactionId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function undo() {
    setLoading(true);

    try {
      const response = await fetch(
        `/api/transactions/${transactionId}/undo-auto-label`,
        { method: "POST" },
      );
      await parseApiResponse(response);
      toast.success("Auto-label undone");
      router.refresh();
    } catch (error) {
      showErrorToast("Could not undo auto-label", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      disabled={loading}
      size="sm"
      type="button"
      variant="outline"
      onClick={() => void undo()}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Undo2 className="size-4" />
      )}
      Undo auto-label
    </Button>
  );
}
