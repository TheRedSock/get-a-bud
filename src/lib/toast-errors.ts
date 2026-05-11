"use client";

import { toast } from "sonner";

import { messageFromError } from "@/lib/api-client";

export function showErrorToast(
  title: string,
  error: unknown,
  fallback = "Please try again.",
) {
  toast.error(title, {
    description: messageFromError(error, fallback),
  });
}
