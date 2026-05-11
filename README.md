# Get a Bud

Get a Bud is a personal budgeting web app built with Next.js App Router,
TypeScript, Tailwind, shadcn/ui-style components, Recharts, Neon Postgres,
Drizzle ORM, Auth.js, Inngest, and Enable Banking.

## MVP

Implemented in this prototype:

- Responsive dark-first UI with desktop sidebar, mobile bottom navigation, local
  Mona Sans assets, and a public `/demo` dashboard for design testing.
- Auth.js credentials sign-in/register flow plus Google/GitHub OAuth placeholders.
- Neon/Drizzle schema for users, households, accounts, transactions, budgets,
  categories, recurring bills, manual assets/debts, exchange rates and ingestion.
- Manual fallback APIs for accounts, transactions, categories, budgets, assets,
  liabilities and bills, with editable account metadata and transaction notes,
  merchant, category, status and budget exclusion fields.
- Enable Banking adapter with server-side JWT signing, encrypted PEM storage,
  bank authorization redirect, callback session exchange, connection records,
  account detail lookup, paginated transaction sync, sync progress state and
  rate-limit pause/resume handling.
- Inngest jobs for bank sync, scheduled sync, categorization, recurring bill
  detection and notification batching scaffolds.
- Dashboard visualizations for balance, cash flow, category spend, budget
  health, bills and net worth.

## Setup

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run dev
```

The real `.env`, `.env.preview` and `.env.prod` files are intentionally ignored.
Use `.env` for local development, `.env.preview` as the Vercel Preview/staging
reference, and `.env.prod` for production values. Configure the same variables
in the matching Vercel environment.

## Scripts

- `npm run dev` starts the Next.js dev server.
- `npm run build` builds the app.
- `npm run typecheck` runs TypeScript.
- `npm run lint` runs Next linting.
- `npm run test` runs the Vitest suite once.
- `npm run test:watch` runs Vitest in watch mode.
- `npm run test:coverage` runs tests with V8 coverage.
- `npm run db:generate` creates Drizzle migration files from `src/db/schema.ts`.
- `npm run db:migrate` applies migrations.
- `npm run db:studio` opens Drizzle Studio.
- `npm run db:prod:migrate` applies committed migrations to the production
  database from `.env.prod` without changing your shell or local `.env`.
- `npm run db:prod:studio` opens Drizzle Studio against the production database.

`db:generate` is usually the right command during development because migration
files should be generated from source schema changes and committed. Production
should only run committed migrations through `db:prod:migrate`.

## Service Notes

Enable Banking is modeled as one ingestion source, not as the canonical account
model. Manual entry, future imports and future licensed bank aggregators can all
write into the same ledger tables.

Imported account rows keep user-editable metadata such as display name, account
type and institution separate from provider-owned IDs and transaction data.
Bank-synced transaction amount, date, account and currency are immutable in the
UI, while user-owned enrichment fields remain editable.

Account balances are calculated from ledger transactions. When Enable Banking
reports a balance that cannot be explained by the available imported history, the
sync creates or updates an opening balance adjustment transaction so the ledger
sum and displayed balance stay consistent. Synced accounts also flag when manual
transactions exist on the same account because those can affect reconciliation.

Private PEM contents are encrypted with `FIELD_ENCRYPTION_KEY` using AES-GCM
before storage. Runtime Enable Banking sync only uses the application ID and PEM
saved on a user connection. The app starts EB authorization, handles
`/api/callback`, stores the resulting server-side session, and queues sync.
`ENABLE_BANKING_TEST_APPLICATION_ID` and `ENABLE_BANKING_TEST_PEM_PATH` are
reserved for explicit tests only.

Initial Enable Banking transaction imports use `strategy=longest` and follow
`continuation_key` until the provider returns no cursor, including empty pages
with a continuation key. Incremental syncs use a recent default window. If the
bank or ASPSP returns rate limiting, the Inngest sync records current progress,
pauses the run and resumes after the retry time or a six-hour fallback.

## Next Steps

- Wire the remaining budget, asset and liability UI forms to their existing API
  routes.
- Add ASPSP search/selection UI on top of the authenticated Enable Banking
  `/aspsps` endpoint.
- Harden runtime protection with Arcjet rate limits on auth, registration and
  integration routes.
- Add focused tests for session callback exchange, transaction import
  deduplication, sync pagination/rate-limit behavior and ledger reconciliation.
- Deploy Vercel Development, Preview and Production environment variables
  separately, then run migrations for each Neon branch.
- Expand recurring bill detection, forecasting and notification delivery after
  the MVP ledger workflow is validated.
