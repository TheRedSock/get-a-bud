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
- Auth middleware for app/API routes plus Arcjet rate limits on registration,
  credentials auth and Enable Banking authorization starts.
- Working client forms for manual accounts, transactions, budgets, assets and
  liabilities, backed by the standard API error envelope and toast handling.
- Enable Banking adapter with server-side JWT signing, encrypted PEM storage,
  bank authorization redirect, callback session exchange, connection records,
  account detail lookup, paginated transaction sync, sync progress state and
  rate-limit pause/resume handling.
- Inngest jobs for bank sync, scheduled sync, transaction categorization
  (three-tier: merchant identity, rule engine, statistical model), transfer
  linking, recurring bill detection, model retraining, parser backfill, and
  notification batching scaffold.
- Merchant identity and alias resolution for matching the same store across
  different ingestion sources and user-edited merchant labels.
- Three-tier transaction classification: Norwegian description parser (16 format
  families), field-scoped categorization rules with user-correction learning,
  and a per-household Naive Bayes statistical model with Norwegian stemming,
  cross-validated thresholds, and automatic retraining.
- Confidence-driven auto-labeling with type-specific description relabeling,
  metadata-tracked undo, approve/reject/batch-approve suggestion APIs, and
  regression test coverage for stabilization invariants.
- Cross-account transfer linking with confidence scoring and budget exclusion.
- Enhanced recurring bill detection with day-of-month histogram peaks,
  cadence analysis, amount clustering by original currency, delayed-payment
  reconciliation, and cancellation flagging.
- File-import normalization scaffolding with a DNB credit card period export
  adapter, shared date/amount/name helpers, and an import format registry.
- Live authenticated pages for dashboard, accounts, transactions, budgets, bills,
  net worth and search. The public `/demo` route remains demo-data driven for
  first-run visual testing.

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

CSV/XLSX-style imports should go through `src/lib/ingestion/imports/` adapters
rather than the Enable Banking parser. The current file-import adapter is
explicitly for DNB credit card period exports; shared helpers handle common
normalization work such as dates, localized amounts and merchant display names.

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
