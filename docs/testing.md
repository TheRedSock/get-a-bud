# Testing

Get a Bud uses Vitest for fast TypeScript tests and React Testing Library for
client components. Playwright covers a small set of public smoke journeys.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run test` | Unit + integration projects |
| `npm run test:unit` | jsdom unit/component tests only |
| `npm run test:integration` | Postgres-backed `*.integration.test.ts` |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:coverage` | Unit coverage (v8) |
| `npm run test:db:up` | Start Docker Compose test Postgres (port 5433) |
| `npm run test:db:migrate` | Apply migrations to test DB (`.env.test`) |
| `npm run test:e2e` | Playwright smoke tests |
| `npm run test:e2e:install` | Install Chromium for Playwright |

Release gates: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`.

## Integration database

Integration tests use Docker Compose (`docker-compose.test.yml`) and
`postgresql://get_a_bud:get_a_bud@127.0.0.1:5433/get_a_bud_test`.

CI runs the `integration` workflow job (migrate + `test:integration`). Locally,
start the database first:

```bash
npm run test:db:up
npm run test:db:migrate
npm run test:integration
```

If Docker is unavailable, integration tests skip via `describe.skipIf`.

## Factories

Shared helpers live in `src/test/factories/` (`createTwoHouseholds`, accounts,
transactions, etc.). Money fields use integer cents.

## Philosophy

Test behavior contracts and invariants, not implementation shape.

- Prefer fast unit tests for finance helpers, validation, ingestion mapping,
  state hashing and error serialization.
- Use **integration tests** for household scoping, registration provisioning,
  and provider transaction deduplication on a real database.
- Use component tests for interactive flows where the user sees a meaningful
  state change or toast.
- Mock external boundaries: Enable Banking HTTP, Sentry, Inngest send, NextAuth
  session (integration tests mock session; DB is real).
- Avoid snapshots and layout-only assertions.
- See `docs/remediation/inventories/mutation-test-matrix.md` for Server Action
  coverage tracking.

## Coverage map

- `src/lib/errors/*` — API envelope and client parsing
- `src/lib/finance/*` — money, budgets, transactions queries/commands
- `src/lib/classification/*` — parser, model, linking, recurring
- `src/lib/security/*` — encryption, rate limiting
- `src/app/(app)/**/actions*.test.ts` — mocked household isolation (fast)
- `src/**/*.integration.test.ts` — durable DB isolation and ingestion contracts
- `src/inngest/functions/*` — job schemas and continuation behavior
- `src/components/forms/*` — form validation, submit, toast errors
