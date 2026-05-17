import type { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getActiveHousehold } from "@/lib/finance/household";
import { isAppError } from "@/lib/errors/app-error";
import { unexpectedError, validationError } from "@/lib/errors/catalog";
import { logger } from "@/lib/logger";

import type { ActionError, ActionResult } from "./types";

/**
 * Authenticated household context available inside every action handler.
 */
export type ActionContext = {
  user: { id: string; email?: string | null; name?: string | null };
  householdId: string;
  householdCurrency: string;
};

export type ValidationSuccess<T> = { data: T; error?: never };
export type ValidationFailure = { data?: never; error: ActionError };

/**
 * Parse and validate action input against a Zod schema.
 *
 * On failure, returns a structured validation error. On success, returns
 * the parsed value. Designed to be called inside an action handler.
 */
export function validateActionInput<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
  message: string,
): ValidationSuccess<z.infer<TSchema>> | ValidationFailure {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors = parsed.error.issues.reduce<Record<string, string[]>>(
      (fields, issue) => {
        const key = issue.path.length ? issue.path.join(".") : "form";
        fields[key] = [...(fields[key] ?? []), issue.message];
        return fields;
      },
      {},
    );
    const firstMessage = Object.values(fieldErrors)[0]?.[0] ?? message;
    return {
      error: { code: "validation_failed", message: firstMessage, fieldErrors },
    };
  }

  return { data: parsed.data };
}

/**
 * Normalize a caught error into a safe ActionError for the client.
 *
 * AppErrors pass their userMessage through. Unknown errors are logged to
 * Sentry/structured logger and return a generic message.
 */
function normalizeToActionError(
  error: unknown,
  operation: string,
): ActionError {
  if (isAppError(error)) {
    if (error.logLevel !== "silent") {
      logger.exception(error, { operation });
    }
    return {
      code: error.code,
      message: error.userMessage,
      fieldErrors: error.fieldErrors,
    };
  }

  const appError = unexpectedError(error, { operation });
  logger.exception(appError, { operation });
  return {
    code: appError.code,
    message: appError.userMessage,
  };
}

/**
 * Create a Server Action that authenticates, resolves household context,
 * and normalizes all errors into a typed ActionResult.
 *
 * Usage:
 * ```ts
 * export const createTransaction = authenticatedAction(
 *   "transactions.create",
 *   async (ctx, input: CreateTransactionInput) => {
 *     // ... domain logic ...
 *     return { transaction };
 *   },
 * );
 * ```
 *
 * The wrapper handles:
 * - Authentication (throws if no session)
 * - Household resolution
 * - Error normalization (AppError -> ActionError, unknown -> generic)
 * - Logging for non-silent errors
 *
 * It does NOT handle:
 * - Input validation (call `validateActionInput` explicitly for clarity)
 * - Rate limiting (call Arcjet explicitly when needed)
 * - Authorization of specific resource IDs (do this in the handler)
 *
 * This keeps ownership checks visible and auditable in each action.
 */
export function authenticatedAction<TInput, TOutput>(
  operation: string,
  handler: (ctx: ActionContext, input: TInput) => Promise<TOutput>,
): (input: TInput) => Promise<ActionResult<TOutput>> {
  return async (input: TInput): Promise<ActionResult<TOutput>> => {
    try {
      const user = await requireUser();
      const household = await getActiveHousehold();

      const ctx: ActionContext = {
        user: { id: user.id!, email: user.email, name: user.name },
        householdId: household.householdId,
        householdCurrency: household.currency,
      };

      const data = await handler(ctx, input);
      return { data };
    } catch (error) {
      return { error: normalizeToActionError(error, operation) };
    }
  };
}
