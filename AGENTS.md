# Agent Guidance

Follow the project architecture in `README.md` and `docs/architecture.md`.
The full engineering philosophy is in `docs/philosophy.md`. Do not read that
file on every prompt; instead load the relevant skill for the area you are
working in.

## Project Layout

```
src/app/          Route shells and API handlers (thin)
src/components/   Shared UI — zero business logic
src/db/           Drizzle schema, migrations, connection
src/inngest/      Background job definitions
src/lib/          Domain logic, integrations, cross-cutting concerns
  auth/           Auth.js config, session helpers
  errors/         AppError catalog, API handler wrapper
  finance/        Budget, balance, category, merchant helpers
  ingestion/      Provider-independent types + provider adapters
    enable-banking/
    imports/
  security/       Arcjet presets, encryption
  logger.ts       Structured logger
```

Dependency flow: `app/ -> components/ -> lib/`. Never import backwards.

## Universal Commandments

1. All money in integer cents. Never float for currency.
2. Authenticate, validate, authorize — in that order — in every server action.
3. All data reads scoped to the active household. Validate foreign keys
   against that household before writes.
4. Types flow from schema. Infer from Drizzle and Zod. Never duplicate types.
5. Data-bound UI has loading, error, and empty states; tiny primitives need
   action feedback (pending/disabled/errors), not artificial empty states.
6. Semantic color tokens, not raw Tailwind colors.
7. No `any`. No unvalidated external input past the boundary.
8. Every background job must be idempotent. Assume it will run twice.
9. Never expose internal errors to the client. Log to Sentry; return a safe
   human message via the error catalog.
10. Abstract the third time, not the first. Duplication over wrong abstraction.
11. Business rules live in domain modules, not in components or route files.
12. Provider-owned transaction facts are immutable. Users may enrich
    (category, merchant, notes, status) but never edit amount, currency,
    account, or date for synced rows.
13. Log deviations, not successes. Keep routine noise muted.
14. One file, one concept. If it needs "and" to describe, split it.
15. Minimize round-trips, maximize per-trip value. Batch, join, parallelize.
16. Every server action has a household-isolation test (integration DB or
    mocked action suite).
17. All deployments pass lint, typecheck, and tests (`test:unit` + `test:integration` in CI).
18. Destructive and provider-sensitive actions require step-up (`requireStepUp`).

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

- Use `logger` from `src/lib/logger.ts`; do not add direct `console.*` logging.
- Log deviations: handled exceptions, provider failures, partial sync
  degradation, failed queues/jobs, suspicious auth/state mismatches and missing
  server configuration.
- Include safe operation names and IDs when helpful. Do not log secrets,
  credentials, auth codes, session IDs, PEM material, raw headers or tokens.

## Testing

- Add or update tests for meaningful behavior contracts whenever changing logic.
- Prefer fast Vitest unit tests for validation, finance helpers, ingestion
  mapping, state hashing and error serialization.
- Cover tenant-boundary rules and durable ledger state transitions when routes
  accept user-supplied IDs or mutate balances.
- Use React Testing Library for client behavior and toast copy. Avoid snapshots
  and layout-only assertions.
- Mock external boundaries such as Enable Banking, Sentry, Inngest, NextAuth and
  network fetches.
- When product behavior changes intentionally, update or remove obsolete tests in
  the same change instead of preserving assertions for old logic.
- Integration tests: `npm run test:db:up` then `test:db:migrate` then
  `test:integration`. See `docs/testing.md`.

Operational runbooks: `docs/runbooks/`.

## Database Migrations

**Never hand-write migration SQL files, journal entries, or snapshot files.**
Always use drizzle-kit to generate migrations from schema changes:

1. Make schema changes in `src/db/schema/*.ts`.
2. Run `npm run db:generate` — this produces the SQL migration, updates
   `meta/_journal.json`, and creates the corresponding `meta/NNNN_snapshot.json`.
3. Review the generated SQL for correctness.
4. Commit the migration, journal, and snapshot together.

Manually creating or editing files under `src/db/migrations/` (including the
`meta/` folder) breaks drizzle-kit's state tracking and causes duplicate or
conflicting migrations on subsequent runs.

**Running migrations against databases:**

- Local: `npm run db:migrate` (reads `.env.local`)
- Preview: `node scripts/db-migrate.mjs .env.preview`
- Production: `npm run db:prod:migrate` (reads `.env.prod`)

Before handing off substantive changes, run `npm run lint`, `npm run typecheck`
and `npm run test` when practical, and mention any command you could not run.

**When changing component boundaries or prop interfaces between server and client
components**, also run `npm run build` — Next.js RSC serialization errors (e.g.
"Functions cannot be passed directly to Client Components") are only caught
during the build, not by `typecheck` or `lint`. CI runs the build on every push
but catching it locally avoids broken deployments.

**Important:** For dynamic pages (those using `searchParams` or `cookies()`),
`next build` does NOT pre-render them — serialization errors only appear at
request time. To guard against this:

1. Never import from barrel files (`index.ts`) that re-export server-only
   modules (e.g. files importing `@/db`) into client components. Import from
   the specific client-safe sub-module instead.
2. Use `ServerBoundaryProps<T>` from `@/lib/utils` on props interfaces of
   client components that receive data from server components — this makes
   TypeScript reject function-typed props at the type level.
3. Never pass functions, class instances, or non-serializable values as props
   from server to client components. Pure data (strings, numbers, arrays,
   plain objects, ReactNode) only.

## Skills — Load Before Working

Load the relevant skill before starting work on a particular area. Skills
contain the detailed design rules an agent must follow and audit against.
In Cursor, read each skill from `.cursor/skills/<skill-name>/SKILL.md`.

| Skill | Load when working on |
|-------|---------------------|
| `schema-data` | `src/db/`, schema changes, migrations, query functions |
| `domain-logic` | `src/lib/` domain modules, file decomposition, TypeScript types |
| `ingestion` | `src/lib/ingestion/`, Enable Banking, bank sync, file imports |
| `background-jobs` | `src/inngest/`, background functions, sync/compute jobs |
| `api-layer` | `src/app/api/`, server actions, auth/authorization, route handlers |
| `ui-components` | `src/components/`, `src/app/(app)/` pages, styling, forms, charts |
| `testing` | Writing or modifying tests across any layer |
| `data-efficiency` | Database queries, data fetching, caching, performance optimization |

Multiple skills may apply. For example, adding a new API endpoint that writes
to the database should load both `api-layer` and `schema-data`.
