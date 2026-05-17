"use client";

import { Loader2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { undoAutoLabel } from "@/app/(app)/transactions/actions";
import { unwrapAction } from "@/lib/actions/client";
import { showErrorToast } from "@/lib/toast-errors";

export function AutoLabelUndoButton({
  transactionId,
  iconOnly = false,
}: {
  transactionId: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function undo() {
    setLoading(true);

    try {
      await unwrapAction(
        undoAutoLabel({ transactionId }),
        "Could not undo auto-label",
      );
      toast.success("Auto-label undone");
      router.refresh();
    } catch (error) {
      showErrorToast("Could not undo auto-label", error);
    } finally {
      setLoading(false);
    }
  }

  const label = "Undo auto-label";

  return (
    <Button
      aria-label={label}
      className={iconOnly ? "size-8 shrink-0 p-0" : undefined}
      disabled={loading}
      size="sm"
      title={label}
      type="button"
      variant="outline"
      onClick={() => void undo()}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Undo2 className="size-4" />
      )}
      {iconOnly ? <span className="sr-only">{label}</span> : label}
    </Button>
  );
}
