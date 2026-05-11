import * as Sentry from "@sentry/nextjs";

import type { AppError, ErrorLogLevel } from "@/lib/errors/app-error";

const SENSITIVE_KEYS = [
  "authorization",
  "code",
  "cookie",
  "encryptedPrivateKey",
  "encryptedPrivateKeyIv",
  "encryptedPrivateKeyTag",
  "password",
  "pem",
  "pemPrivateKey",
  "privateKey",
  "session",
  "sessionId",
  "state",
  "token",
];

type LogContext = Record<string, unknown>;

function shouldRedact(key: string) {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) =>
    normalized.includes(sensitive.toLowerCase()),
  );
}

export function sanitizeForLog(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map(sanitizeForLog);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      shouldRedact(key) ? "[redacted]" : sanitizeForLog(entry),
    ]),
  );
}

function emit(level: Exclude<ErrorLogLevel, "silent">, message: string, context?: LogContext) {
  const sanitized = context ? sanitizeForLog(context) : undefined;

  if (level === "error") {
    console.error(message, sanitized);
    return;
  }

  if (level === "warn") {
    console.warn(message, sanitized);
    return;
  }

  if (process.env.LOG_LEVEL === "debug" || process.env.NODE_ENV === "development") {
    console.info(message, sanitized);
  }
}

export const logger = {
  info(message: string, context?: LogContext) {
    emit("info", message, context);
  },
  warn(message: string, context?: LogContext) {
    emit("warn", message, context);
  },
  error(message: string, context?: LogContext) {
    emit("error", message, context);
  },
  exception(error: AppError, context?: LogContext) {
    if (error.logLevel === "silent") {
      return;
    }

    const logContext = {
      ...context,
      code: error.code,
      status: error.status,
      expected: error.expected,
      ...error.context,
    };
    emit(error.logLevel, error.message, {
      ...logContext,
      cause: error.cause,
    });

    if (error.logLevel === "error" || !error.expected) {
      Sentry.captureException(error.cause ?? error, {
        level: error.logLevel === "error" ? "error" : "warning",
        tags: {
          code: error.code,
          status: String(error.status),
        },
        extra: sanitizeForLog(logContext) as Record<string, unknown>,
      });
    }
  },
};
