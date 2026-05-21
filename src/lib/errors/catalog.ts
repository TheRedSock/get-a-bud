import { ZodError } from "zod";

import { AppError, type FieldErrors } from "@/lib/errors/app-error";

function fieldErrorsFromZod(error: ZodError): FieldErrors {
  return error.issues.reduce<FieldErrors>((fields, issue) => {
    const key = issue.path.length ? issue.path.join(".") : "form";
    fields[key] = [...(fields[key] ?? []), issue.message];
    return fields;
  }, {});
}

function firstZodMessage(fieldErrors: FieldErrors) {
  return Object.values(fieldErrors)[0]?.[0];
}

export function validationError(
  message: string,
  options?: {
    zodError?: ZodError;
    fieldErrors?: FieldErrors;
    context?: Record<string, unknown>;
  },
) {
  const fieldErrors = options?.zodError
    ? fieldErrorsFromZod(options.zodError)
    : options?.fieldErrors;

  return new AppError({
    code: "validation_failed",
    message,
    status: 400,
    userMessage: firstZodMessage(fieldErrors ?? {}) ?? message,
    logLevel: "silent",
    expected: true,
    fieldErrors,
    context: options?.context,
  });
}

export function unauthorizedError(message = "Please sign in to continue.") {
  return new AppError({
    code: "authentication_required",
    message: "Authentication required",
    status: 401,
    userMessage: message,
    logLevel: "silent",
    expected: true,
  });
}

export function forbiddenError(
  message = "You do not have access to this resource.",
  context?: Record<string, unknown>,
) {
  return new AppError({
    code: "forbidden",
    message,
    status: 403,
    logLevel: "warn",
    expected: true,
    context,
  });
}

export function stepUpRequiredError(
  message = "Confirm your password again before this sensitive action.",
) {
  return new AppError({
    code: "step_up_required",
    message,
    status: 403,
    userMessage: message,
    logLevel: "silent",
    expected: true,
  });
}

export function notFoundError(message: string, context?: Record<string, unknown>) {
  return new AppError({
    code: "not_found",
    message,
    status: 404,
    logLevel: "silent",
    expected: true,
    context,
  });
}

export function conflictError(message: string, context?: Record<string, unknown>) {
  return new AppError({
    code: "conflict",
    message,
    status: 409,
    logLevel: "silent",
    expected: true,
    context,
  });
}

export function rateLimitedError(message: string, context?: Record<string, unknown>) {
  return new AppError({
    code: "rate_limited",
    message,
    status: 429,
    logLevel: "warn",
    expected: true,
    context,
  });
}

export function providerError(
  message: string,
  options?: {
    cause?: unknown;
    userMessage?: string;
    context?: Record<string, unknown>;
    status?: number;
  },
) {
  return new AppError({
    code: "provider_error",
    message,
    status: options?.status ?? 502,
    userMessage:
      options?.userMessage ??
      "The bank service did not respond as expected. Please try again later.",
    logLevel: "warn",
    expected: false,
    context: options?.context,
    cause: options?.cause,
  });
}

export function configurationError(
  message: string,
  options?: { context?: Record<string, unknown>; cause?: unknown },
) {
  return new AppError({
    code: "configuration_error",
    message,
    status: 500,
    userMessage: "The app is missing required server configuration.",
    logLevel: "error",
    expected: false,
    context: options?.context,
    cause: options?.cause,
  });
}

export function unexpectedError(
  error: unknown,
  context?: Record<string, unknown>,
) {
  const message =
    error instanceof Error ? error.message : "Unexpected application error";

  return new AppError({
    code: "unexpected_error",
    message,
    status: 500,
    userMessage: "Something unexpected happened. Please try again.",
    logLevel: "error",
    expected: false,
    context,
    cause: error,
  });
}
