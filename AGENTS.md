# Agent Guidance

Follow the project architecture in `README.md` and `docs/architecture.md`.
Finance ledger logic belongs in `src/lib/finance`, provider-independent
ingestion in `src/lib/ingestion`, Enable Banking specifics in
`src/lib/ingestion/enable-banking`, durable schema in `src/db/schema.ts`, and
background workflows in `src/inngest`.

## Error Handling

- Use `AppError` factories from `src/lib/errors/catalog.ts` for expected
  failures. Do not introduce new ad hoc `{ error: string }` responses.
- Wrap new App Router API handlers with `withApiHandler()` from
  `src/lib/errors/api.ts`.
- Validate JSON bodies with `validateJsonBody()` and Zod. Let field errors flow
  through the standard error envelope.
- Client code should parse fetch responses with `parseApiResponse()` and show
  failures through `showErrorToast()` or equally specific route-level toast copy.
- Toast messages must be human readable and actionable. Never show raw provider,
  database, token, PEM, session or stack messages to the user.

## Logging

- Keep routine logs muted. Do not log successful expected actions just because
  they completed.
- Log deviations: handled exceptions, provider failures, partial sync
  degradation, failed queues/jobs, suspicious auth/state mismatches and missing
  server configuration.
- Use `logger` from `src/lib/logger.ts`; do not add direct `console.*` logging.
- Include safe operation names and IDs when helpful. Do not log secrets,
  credentials, auth codes, session IDs, PEM material, raw headers or tokens.
- `SENTRY_DSN` is configured through environment variables; unexpected errors
  should flow to Sentry through the shared logger/instrumentation.

## Testing

- Add or update tests for meaningful behavior contracts whenever changing logic.
- Prefer fast Vitest unit tests for validation, finance helpers, ingestion
  mapping, state hashing and error serialization.
- Use React Testing Library for client behavior and toast copy. Avoid snapshots
  and layout-only assertions.
- Mock external boundaries such as Enable Banking, Sentry, Inngest, NextAuth and
  network fetches.
- Avoid redundant CRUD tests after the shared route wrapper is covered. Test
  route-specific rules, ownership boundaries and durable state transitions.
- When product behavior changes intentionally, update or remove obsolete tests in
  the same change instead of preserving assertions for old logic.

Before handing off substantive changes, run `npm run lint`, `npm run typecheck`
and `npm run test` when practical, and mention any command you could not run.
