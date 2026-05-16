import * as Sentry from "@sentry/nextjs";

/**
 * Patterns that should be redacted from Sentry event payloads.
 * Mirrors the sensitive-key list in src/lib/logger.ts.
 */
const SENSITIVE_PATTERNS = [
  "authorization",
  "code",
  "cookie",
  "encryptedprivatekey",
  "password",
  "pem",
  "privatekey",
  "secret",
  "session",
  "sessionid",
  "state",
  "token",
  "accountnumber",
  "iban",
  "sortcode",
  "routingnumber",
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      scrubbed[key] = "[Filtered]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      scrubbed[key] = scrubObject(value as Record<string, unknown>);
    } else {
      scrubbed[key] = value;
    }
  }
  return scrubbed;
}

export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,

    beforeSend(event) {
      // Drop expected domain errors that should not pollute Sentry
      const errorCode = event.tags?.code;
      if (
        errorCode &&
        ["validation_failed", "authentication_required", "not_found"].includes(
          String(errorCode),
        )
      ) {
        return null;
      }

      // Scrub sensitive data from extra context
      if (event.extra) {
        event.extra = scrubObject(event.extra as Record<string, unknown>);
      }

      // Scrub breadcrumb data
      if (event.breadcrumbs) {
        for (const breadcrumb of event.breadcrumbs) {
          if (breadcrumb.data && typeof breadcrumb.data === "object") {
            breadcrumb.data = scrubObject(
              breadcrumb.data as Record<string, unknown>,
            );
          }
        }
      }

      // Scrub request headers
      if (event.request?.headers) {
        const headers = event.request.headers;
        for (const key of Object.keys(headers)) {
          if (isSensitiveKey(key)) {
            headers[key] = "[Filtered]";
          }
        }
      }

      return event;
    },

    beforeSendTransaction(event) {
      // Drop health check noise from transaction traces
      if (event.transaction?.includes("/api/health")) {
        return null;
      }
      return event;
    },
  });
}

export const onRequestError = Sentry.captureRequestError;
