# Testing

Get a Bud uses Vitest for fast TypeScript tests and React Testing Library for
client components. Playwright can be added later for a small number of full
browser smoke tests when the form workflows are stable.

## Commands

- `npm run test` runs the test suite once.
- `npm run test:watch` runs Vitest in watch mode.
- `npm run test:coverage` runs tests with V8 coverage.
- `npm run lint`, `npm run typecheck` and `npm run build` remain release quality
  gates.

## Philosophy

Test behavior contracts and invariants, not implementation shape.

- Prefer fast unit tests for finance helpers, validation, ingestion mapping,
  state hashing and error serialization.
- Add integration tests only around high-value boundaries: auth/bootstrap,
  household scoping, manual ledger writes, Enable Banking sync and Inngest state.
- Use component tests for interactive flows where the user sees a meaningful
  state change or toast.
- Mock external boundaries: Enable Banking, Sentry, Inngest, NextAuth and fetch.
- Avoid snapshots and layout-only assertions. Assert accessible controls, copy,
  API contracts and durable state transitions.
- Do not duplicate the same CRUD test across every route after the shared route
  wrapper is covered. Add one representative route test plus route-specific
  business rules.
- When behavior changes intentionally, update or delete obsolete assertions in
  the same change. Do not preserve tests that only document old logic.

## Initial Coverage Targets

- `src/lib/errors/*`: API envelope, normalization, validation parsing and safe
  client parsing.
- `src/lib/finance/*`: Zod schemas, merchant normalization, category matching,
  balance recalculation and budget read models.
- `src/lib/security/*`: encryption key validation and round trips.
- `middleware.ts`: public route exceptions and authenticated app/API behavior.
- `src/app/api/transactions/*`: household ownership boundaries for accounts and
  categories.
- `src/lib/ingestion/enable-banking/*`: authorization state handling, provider
  payload mapping, rate-limit behavior and safe provider errors.
- `src/components/auth/*` and bank sync components: user-facing failure copy and
  success/failure transitions.

The current audit follow-up list in `refs/remaining-audit-items.md` calls out
the highest-value sync scenarios that still need deeper regression coverage.
