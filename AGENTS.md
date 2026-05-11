# Agent Guidance

Follow the project architecture in `README.md` and `docs/architecture.md`.
Finance ledger logic belongs in `src/lib/finance`, provider-independent
ingestion in `src/lib/ingestion`, Enable Banking specifics in
`src/lib/ingestion/enable-banking`, durable schema in `src/db/schema.ts`, and
background workflows in `src/inngest`.

## Ledger and Ingestion Invariants

- Keep user-editable account metadata on `financial_accounts` separate from
  provider identity and raw payload data on `provider_accounts`.
- Do not let users edit bank-owned transaction facts for synced rows, including
  amount, currency, account and date. User enrichment such as category, merchant,
  notes, status and budget exclusion may be editable.
- Imported account balances must be derived from transactions. If provider
  history is incomplete, maintain a ledger offset transaction rather than writing
  an unexplained balance directly.
- Enable Banking transaction pagination must keep request parameters stable while
  following `continuation_key` until it is absent, even when a page contains no
  transactions. Continuation keys are scoped to the current sync run and request
  parameter set; never seed a new run from an old provider account cursor.
- Treat `ASPSP_RATE_LIMIT_EXCEEDED` or HTTP 429 as a paused sync. Record progress
  and retry after the provider retry time or a six-hour fallback.

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
