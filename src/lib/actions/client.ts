"use client";

import { toast } from "sonner";

import type { ActionResult } from "@/lib/actions/types";

/**
 * Unwrap a Server Action result for use in client components.
 *
 * On success, returns the data. On error, shows a toast and throws so
 * callers can use try/catch for flow control.
 *
 * Usage:
 * ```ts
 * const { transaction } = await unwrapAction(
 *   createTransaction(input),
 *   "Failed to create transaction",
 * );
 * ```
 */
export async function unwrapAction<T>(
  resultOrPromise: ActionResult<T> | Promise<ActionResult<T>>,
  errorTitle: string,
): Promise<T> {
  const result = await resultOrPromise;

  if (result.error) {
    toast.error(errorTitle, { description: result.error.message });
    throw new ActionClientError(result.error);
  }

  return result.data;
}

/**
 * Client-side error representing a failed Server Action.
 * Mirrors the shape of ApiClientError for consistency.
 */
export class ActionClientError extends Error {
  readonly code: string;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(error: { code: string; message: string; fieldErrors?: Record<string, string[]> }) {
    super(error.message);
    this.name = "ActionClientError";
    this.code = error.code;
    this.fieldErrors = error.fieldErrors;
  }
}
