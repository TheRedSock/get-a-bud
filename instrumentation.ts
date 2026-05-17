import * as Sentry from "@sentry/nextjs";

/**
 * Patterns that should be redacted from Sentry event payloads.
 * Mirrors the sensitive-key list in src/lib/logger.ts.
 */
const SENSITIVE_KEY_PATTERNS = [
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
  "creditcard",
  "cvv",
  "ssn",
];

/**
 * Value patterns that indicate sensitive data regardless of key name.
 * Matches common credential/token formats in string values.
 */
const SENSITIVE_VALUE_PATTERNS = [
  /^-----BEGIN.*PRIVATE KEY-----/,
  /^eyJ[A-Za-z0-9_-]+\.eyJ/, // JWT pattern
  /^sk_[a-z]+_[A-Za-z0-9]+/, // Stripe-style secret keys
  /^ajkey_/, // Arcjet keys
  /^whsec_/, // Webhook secrets
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function isSensitiveValue(value: unknown): boolean {
  if (typeof value !== "string" || value.length < 10) return false;
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      scrubbed[key] = "[Filtered]";
    } else if (typeof value === "string" && isSensitiveValue(value)) {
      scrubbed[key] = "[Filtered]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      scrubbed[key] = scrubObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      scrubbed[key] = value.map((item) =>
        item && typeof item === "object"
          ? scrubObject(item as Record<string, unknown>)
          : typeof item === "string" && isSensitiveValue(item)
            ? "[Filtered]"
            : item,
      );
    } else {
      scrubbed[key] = value;
    }
  }
  return scrubbed;
}

export function register() {
  // Note: instrumentation.ts runs in a special Next.js edge/node bootstrap
  // context before the app fully initializes. Using process.env directly here
  // is the justified exception — importing serverEnv would trigger Zod
  // validation which may fail during build-time instrumentation registration.
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
    sendDefaultPii: false,

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

      // Scrub request headers and body
      if (event.request) {
        if (event.request.headers) {
          const headers = event.request.headers;
          for (const key of Object.keys(headers)) {
            if (isSensitiveKey(key)) {
              headers[key] = "[Filtered]";
            }
          }
        }
        if (event.request.data && typeof event.request.data === "object") {
          event.request.data = scrubObject(
            event.request.data as Record<string, unknown>,
          );
        } else if (
          typeof event.request.data === "string" &&
          isSensitiveValue(event.request.data)
        ) {
          event.request.data = "[Filtered]";
        }
      }

      // Scrub contexts
      if (event.contexts) {
        for (const [contextKey, contextValue] of Object.entries(event.contexts)) {
          if (contextValue && typeof contextValue === "object") {
            event.contexts[contextKey] = scrubObject(
              contextValue as Record<string, unknown>,
            );
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
