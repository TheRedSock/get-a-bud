---
name: domain-logic
description: Use when working on src/lib/ domain modules, finance helpers, file decomposition, module boundaries, or TypeScript types. Covers file cohesion, dependency direction, abstraction philosophy, and TypeScript discipline.
---

# Domain Logic & Module Design

Source: `docs/philosophy.md` sections 3-6 (File Cohesion, Dependencies,
Abstraction, TypeScript Discipline).

Domain logic lives in `src/lib/`. Each domain module owns its business rules,
types, helpers, and tests. Business rules must never live in components or
route files.

## File Cohesion — One File, One Concept

A file should have **one reason to change.** If describing the file requires
"and" to connect unrelated concepts, split it.

**Split when:**
- Multiple unrelated exports serve different consumers
- Mixed abstraction levels (orchestration + infrastructure helpers)
- Length is a symptom of multiple concerns sharing an entry point
- Cannot name the file more specifically than `utils.ts` or `helpers.ts`

**Categories are directories; concepts are files.** If you cannot name a file
by its single purpose, it is probably a category that should be a directory.

### Directory-Over-File Principle

When a concern outgrows one file, promote to a directory:

```
# Before
lib/finance/budgets.ts          # 500 lines: calculations + queries + types

# After
lib/finance/budgets/
  calculations.ts               # Pure budget math
  queries.ts                    # Database reads
  mutations.ts                  # Database writes
  types.ts                      # Domain types
  index.ts                      # Public API re-exports
```

The `index.ts` controls the public API. Internal files can be restructured
without breaking consumers.

### Utility Module Rules

- **No catch-all utility files.** Split by purpose: `dates.ts`, `currency.ts`,
  not `utils.ts`.
- **Domain-specific utilities live in the domain module.** Only truly generic
  helpers belong in shared space.
- **Narrow scope, narrow name.** `format-currency.ts` not `money-helpers.ts`.

## Dependency Direction

```
app/  ->  components/  ->  lib/  ->  external packages
```

Each layer may only import inward.
- `lib/` knows nothing about React or Next.js routing.
- Components know nothing about database schemas.
- Domain logic is portable and independently testable.

**No circular dependencies.** If two modules cross-import, lift the shared
contract up or introduce a coordination layer.

**Keep public interfaces small.** Export only what is truly needed for reuse.

**Isolate third-party SDKs.** Wrap external infrastructure (Arcjet, Sentry,
Inngest, banking providers) in adapter modules. SDK swap = one module change.

**State flows down, events flow up.** React components receive data as props,
emit intent via actions or callbacks.

## Abstraction Philosophy

- **Rule of Three.** Write it once. Note duplication the second time. Abstract
  the third time, with evidence the concept is real and stable.
- **A good abstraction names a business idea.** `calculateBudgetRemaining`,
  `detectDuplicateImportRows`. Bad: names an implementation detail.
- **Every abstraction must pay a readability tax.** It must be clearly simpler
  to use than the code it replaced.
- **Prefer duplication over wrong abstraction.** Bad abstractions are harder
  to unwind than duplicated code.

### Separate Orchestration from Policy

| Layer | Responsibility |
|-------|---------------|
| Server Actions / Route Handlers | Orchestrate: authenticate, validate, authorize, execute, return |
| Domain Services (`lib/`) | Decide: is this allowed? how is it calculated? what does it mean? |
| Database Queries | Fetch/store: read and write durable state |
| UI Components | Render: display state and emit intent |

A server action containing financial calculation logic violates this. A
component deciding budget rollover validity violates this.

### Favor Pure Functions for Business Rules

Finance logic is easiest to test as pure functions:
`calculateBudgetRemaining`, `classifyTransaction`, `computeMonthBoundary`,
`detectDuplicateImportRows`, `normalizeAmount`.

Pure logic runs in isolation — no database, no network, no React. Highest-value
unit tests live here.

## TypeScript Discipline

- **Infer, don't duplicate.** Derive types from Drizzle and Zod schemas.
  Never write parallel interfaces for the same shape.

```ts
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
```

- **Zod for runtime boundaries.** All external input (forms, API bodies, env
  vars, webhooks) passes through Zod. Never trust `any` from the wire.
- **No `any`, no `as` casts.** Use `satisfies`, `unknown` + narrowing, or
  explicit generics. `any` only in unavoidable boundary glue with comment.
- **Discriminated unions for state.** Model async states explicitly:

```ts
type QueryState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string };
```

- **Enums as const objects.** Avoid TypeScript `enum`. Use `as const` maps
  or Zod `.enum()`.
- **Narrow, explicit types** over broad `Record<string, any>` shapes.

### Type Boundaries

Explicit types are required at:
- Request input validation schemas
- Database row shapes (inferred from Drizzle)
- Internal domain objects
- API response contracts
- Form schemas
- Background job event payloads

### Avoid

- Duplicating the same shape in multiple places
- Type gymnastics that make code harder to read than untyped code
- Leaking raw database row types into UI components
- Using raw Tailwind/style types where semantic types would be clearer

## Code Readability Rules

- **Max nesting depth: 3.** Use early returns (guard clauses) to flatten.
- **One level of abstraction per function.**
- **Avoid boolean parameters.** Use options objects or separate functions.
- **Comment the "why", not the "what."**
- **No commented-out code.** Use git history.
- **JSDoc for public module API functions.**

## Self-Audit Checklist

Before completing domain logic work, verify:

- [ ] File has one concept (describable without "and")
- [ ] All exports serve the same consumer for the same reason
- [ ] Dependencies flow inward only (no backward imports)
- [ ] Types inferred from schema, not manually duplicated
- [ ] Business rules are pure functions where possible
- [ ] No `any` or `as` casts without justification comment
- [ ] External input validated with Zod at boundaries
- [ ] Public API surface is minimal (only export what is reused)
- [ ] Abstractions name business ideas, not implementation details
- [ ] Functions have max nesting depth of 3
