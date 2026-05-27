# Secrets Runbook

## Required secrets

| Secret | Used by |
|--------|---------|
| `DATABASE_URL` | App, Drizzle, Inngest jobs |
| `NEXTAUTH_SECRET` / `AUTH_SECRET` | Auth.js session signing |
| `FIELD_ENCRYPTION_KEY` | AES-256-GCM for provider PEM storage |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Application rate limiting (when `RATE_LIMIT_PROVIDER=upstash`) |
| `RATE_LIMIT_PROVIDER` | `upstash` (production default) or `noop` (tests) |
| `SENTRY_DSN` | Error reporting (production) |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Background jobs |
| OAuth client secrets | Google/GitHub sign-in (optional) |

Store in Vercel encrypted environment variables. Never commit `.env` or PEM files.

## Rotation: Auth secret

1. Generate a new random 32+ byte secret.
2. Set `NEXTAUTH_SECRET` in Vercel for the environment.
3. Redeploy — all sessions invalidate; users sign in again.

## Rotation: Field encryption key

**Gap:** dual-key read during rotation is not implemented. Today rotation requires:

1. Decrypt all `ingestion_connections` encrypted PEM fields with the old key.
2. Re-encrypt with the new key.
3. Update `FIELD_ENCRYPTION_KEY` and redeploy.

Track implementation of dual-key support as future work.

## Rotation: Enable Banking credentials

1. Revoke compromised application credentials at Enable Banking.
2. Update connection PEM in the app (encrypted at rest).
3. Re-authorize affected connections.

## PEM in working tree

Do not keep `*.pem` in the repository root. Move to a secrets manager or path outside git.
