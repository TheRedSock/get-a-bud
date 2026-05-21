"use client";

import { Loader2 } from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type DestructiveConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Wraps the control that opens the dialog; focus returns here on close. */
  trigger?: ReactElement;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void | Promise<void>;
};

export function DestructiveConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  pending = false,
  errorMessage = null,
  onConfirm,
}: DestructiveConfirmDialogProps) {
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && pending) {
      return;
    }
    onOpenChange(nextOpen);
  }

  const describedBy = errorMessage
    ? "destructive-confirm-description destructive-confirm-error"
    : "destructive-confirm-description";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent aria-describedby={describedBy}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription id="destructive-confirm-description">
            {description}
          </DialogDescription>
          {errorMessage ? (
            <p
              id="destructive-confirm-error"
              className="text-sm text-destructive"
              role="alert"
              aria-live="assertive"
            >
              {errorMessage}
            </p>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => void onConfirm()}
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {confirmLabel}...
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
