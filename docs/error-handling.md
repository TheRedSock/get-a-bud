# Error Handling And Logging

Get a Bud uses one shared error contract for route handlers, background jobs and
client toasts.

## Server Contract

- Use `AppError` factories from `src/lib/errors/catalog.ts` for expected
  failures: validation, auth, forbidden, not found, conflict, rate limits,
  provider failures and configuration issues.
- Wrap App Router route handlers with `withApiHandler()` from
  `src/lib/errors/api.ts`. Do not return ad hoc `{ error: string }` payloads in
  new routes.
- Validate JSON request bodies with `validateJsonBody()`. Let Zod field errors
  flow through the standard envelope instead of duplicating validation in the UI.
- Do not expose raw database, provider, auth, PEM, token, session or header
  details in `userMessage`. Put safe diagnostic context on the error instead.

Standard failed API response:

```json
{
  "ok": false,
  "error": {
    "code": "validation_failed",
    "message": "Name is required.",
    "fieldErrors": {
      "name": ["Name is required."]
    },
    "requestId": "..."
  }
}
```

## Logging Policy

Routine successful actions should not log. If the expected outcome happened, the
database state or UI already proves it.

Log deviations:

- handled exceptions unless the error is the expected user outcome;
- external provider failures and partial provider degradation;
- failed Inngest queueing or job failures;
- missing required server configuration;
- suspicious auth, ownership or state mismatches.

Use `logger` from `src/lib/logger.ts` instead of direct `console.*`. The logger
redacts sensitive fields and sends unexpected errors to Sentry when `SENTRY_DSN`
is configured.

## Client UX

- Parse API responses with `parseApiResponse()`.
- Show failed user actions with `showErrorToast()` or route-specific copy.
- Toast descriptions must be human readable and actionable. Avoid vague copy
  like `Error occurred during sync` when the server can say what the user should
  do next.
- Never toast raw provider or database messages.

## Background Work

Inngest jobs should persist user-safe status in durable tables such as
`sync_runs.errorCode` and `sync_runs.errorMessage`, then log richer sanitized
diagnostics through `logger.exception()`. Rethrow unexpected job failures so
Inngest can retry and surface them operationally.

Long-running jobs should checkpoint through durable database state and enqueue
continuation events before approaching serverless runtime or Inngest step
limits. Enable Banking sync stores progress on `sync_runs.metadata`; parser
backfill stores per-row progress by setting `parser_source` to `norwegian` or
`none`. Continuation events should be safe to replay and should not depend on
ephemeral cursors unless those cursors are scoped to the current durable run.

Keep Inngest Production keys isolated from preview and branch deployments.
Sharing the same event/signing keys across environments can cause production
events to be dispatched to the latest synced preview endpoint, which makes job
step output disagree with the production database.
