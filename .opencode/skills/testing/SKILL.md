---
name: testing
description: Use when writing or modifying tests across any layer. Covers the testing pyramid, unit and integration test strategies, security and authorization testing, performance regression testing, and test hygiene rules.
---

# Testing Strategy

Source: `docs/philosophy.md` section 16 (Testing Strategy).

Testing mirrors the risk profile. For a finance app, the highest-value tests
protect money math, domain rules, and data isolation.

## Testing Pyramid

```
         /\
        /  \   E2E (Playwright) — critical user journeys only
       /----\
      /      \  Integration (Vitest) — Server Actions, DB queries, auth flows
     /--------\
    /          \ Unit (Vitest) — pure functions, schemas, domain logic
   /____________\
```

## Unit Tests (fast, numerous)

Test pure domain functions: budget math, categorization rules, date boundaries,
duplicate detection, recurring matching, currency formatting, transformation
pipelines, state hashing.

- No mocking needed — pure in, pure out.
- Highest confidence per test-second ratio.
- Co-locate with source: `.test.ts` siblings or `__tests__/` directories.

## Integration Tests

- Test server actions and query functions with real database state.
- Cover tenant-boundary rules (household scoping) and durable ledger state
  transitions.
- Seed with factory functions, not fixture files.
- Use React Testing Library for client behavior and toast copy.
- Mock external boundaries: banking providers, Sentry, Inngest, NextAuth,
  network fetches.

## E2E Tests (Playwright)

- Reserve for the most valuable paths: onboarding, connect account, create
  budget, view report, import flow.
- Do not cover every UI state with E2E — too slow and brittle.

## Security & Authorization Testing (MANDATORY)

These tests are **mandatory**, not optional hardening:

- **Household-isolation test for every server action.** Prove that user A
  cannot access/modify user B's data by manipulating IDs. This is the single
  highest-value integration test category for multi-tenant finance.
- **Auth boundary tests.** Prove unauthenticated requests to protected
  endpoints return 401/403, not data.
- **Foreign key ownership tests.** When a server action accepts an ID parameter,
  test that supplying an ID from another household is rejected — not silently
  ignored, not partially processed.
- **Rate limit tests.** Verify Arcjet rules engage on protected endpoints.
- **Input validation tests.** Verify malformed, oversized, or malicious input
  is rejected by Zod schemas before reaching domain logic.

## Performance Regression Testing

- Critical database queries (dashboard aggregations, transaction list, budget
  calculations) should have performance assertions or monitoring.
- Introduce seed factories generating realistic data volumes (hundreds of
  transactions) so performance issues surface in test, not production.

## Test Hygiene Rules

- **Test the rule, not the implementation detail.** Don't assert on internal
  method calls; assert on observable behavior.
- **Test edge cases and failure states**, not just the happy path.
- **No test depends on another test's state.** Each test sets up its own.
- **Tests are documentation.** They should be readable as behavior specifications.
- **When behavior changes intentionally, update or remove obsolete tests** in
  the same change. Don't preserve assertions for old logic.
- **Avoid snapshot tests and layout-only assertions.**
- **Avoid redundant CRUD tests** after the shared route wrapper is covered.
  Test route-specific rules, ownership boundaries, and durable state transitions.

## What to Test When

| Change type | Required tests |
|-------------|---------------|
| Pure domain function | Unit test for inputs/outputs, edge cases |
| Server action | Household-isolation test, input validation, auth boundary |
| Database query | Scoping by household, correct return shape |
| UI component | Loading/error/empty states, user interactions, toast copy |
| Background job | Idempotency, checkpoint/resume, partial failure handling |
| Ingestion adapter | Mapping correctness, deduplication, malformed input |
| Schema migration | Forward compatibility with existing code |

## Heuristic

If a bug would be expensive or embarrassing in production, there should be a
test that could catch it.

## Self-Audit Checklist

Before completing test work, verify:

- [ ] Tests cover behavior contracts, not implementation details
- [ ] Edge cases and failure paths included
- [ ] Server actions have household-isolation tests
- [ ] Auth boundaries tested (unauthenticated = 401/403)
- [ ] Foreign key ownership tested (cross-household IDs rejected)
- [ ] No test depends on another test's state
- [ ] External boundaries mocked (providers, Sentry, Inngest, NextAuth)
- [ ] Seed data uses factory functions, not fixture files
- [ ] Obsolete tests updated or removed when behavior changes
- [ ] No snapshot tests or layout-only assertions
