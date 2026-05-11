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
  liabilities and bills.
- Enable Banking adapter with server-side JWT signing, encrypted PEM storage,
  bank authorization redirect, callback session exchange, connection records,
  sync runs and rate-limit state.
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
- `npm run db:generate` creates Drizzle migration files from `src/db/schema.ts`.
- `npm run db:migrate` applies migrations.
- `npm run db:studio` opens Drizzle Studio.

## Service Notes

Enable Banking is modeled as one ingestion source, not as the canonical account
model. Manual entry, future imports and future licensed bank aggregators can all
write into the same ledger tables.

Private PEM contents are encrypted with `FIELD_ENCRYPTION_KEY` using AES-GCM
before storage. Runtime Enable Banking sync only uses the application ID and PEM
saved on a user connection. The app starts EB authorization, handles
`/api/callback`, stores the resulting server-side session, and queues sync.
`ENABLE_BANKING_TEST_APPLICATION_ID` and `ENABLE_BANKING_TEST_PEM_PATH` are
reserved for explicit tests only.

## Next Steps

- Wire the manual account, transaction, budget, asset and liability UI forms to
  their existing API routes.
- Add ASPSP search/selection UI on top of the authenticated Enable Banking
  `/aspsps` endpoint.
- Harden runtime protection with Arcjet rate limits on auth, registration and
  integration routes.
- Add focused tests for registration, household bootstrapping, EB state
  validation, session callback exchange and transaction import deduplication.
- Deploy Vercel Development, Preview and Production environment variables
  separately, then run migrations for each Neon branch.
- Expand recurring bill detection, forecasting and notification delivery after
  the MVP ledger workflow is validated.
