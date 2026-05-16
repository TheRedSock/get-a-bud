# Engineering Philosophy & Conventions

This document defines the architectural ideals for a personal finance platform
built with Next.js App Router, TypeScript, Tailwind, shadcn/ui-style
components, Recharts, Neon Postgres, Drizzle ORM, Auth.js, Inngest, Sentry,
Arcjet, and Vercel.

It is a target to measure against — not a description of current state. Use it
as the reference for how code should be structured, how features should grow,
how the UI should behave, and how the system should remain testable, readable,
and maintainable over time.

### Scope

This document covers **engineering conventions, architectural principles, and
auditable quality standards** for the application codebase. It is the primary
reference for code reviews, architectural decisions, and automated/manual
audits of existing code.

It does **not** replace:

- A formal threat model or penetration test report (separate security document)
- Regulatory compliance matrices (PCI, PSD2, GDPR — separate compliance docs)
- Deployment runbooks or infrastructure-as-code definitions (ops documentation)
- Architecture Decision Records (ADRs) for individual historical choices

When those documents exist, this philosophy should be consistent with them. When
they do not yet exist, this document's principles inform their creation.

---

## Table of Contents

1. [Core Principles](#1-core-principles)
2. [Repository Structure](#2-repository-structure)
3. [File Cohesion & Module Decomposition](#3-file-cohesion--module-decomposition)
4. [Dependency Direction & Module Boundaries](#4-dependency-direction--module-boundaries)
5. [Abstraction Philosophy](#5-abstraction-philosophy)
6. [TypeScript Discipline](#6-typescript-discipline)
7. [Data Layer & Financial Integrity](#7-data-layer--financial-integrity)
8. [Authentication, Authorization & Tenancy](#8-authentication-authorization--tenancy)
9. [API Layer — Server Actions & Route Handlers](#9-api-layer--server-actions--route-handlers)
10. [Background Jobs — Inngest](#10-background-jobs--inngest)
11. [Ingestion & External Provider Integration](#11-ingestion--external-provider-integration)
12. [Data Fetching, Caching & Computational Efficiency](#12-data-fetching-caching--computational-efficiency)
13. [Security — Arcjet & Runtime Protection](#13-security--arcjet--runtime-protection)
14. [Error Handling](#14-error-handling)
15. [Logging & Observability](#15-logging--observability)
16. [Testing Strategy](#16-testing-strategy)
17. [Scalability](#17-scalability)
18. [Feature Development Governance](#18-feature-development-governance)
19. [CI/CD & Deployment Governance](#19-cicd--deployment-governance)
20. [Code Readability & Maintenance](#20-code-readability--maintenance)
21. [UI Architecture — Component System](#21-ui-architecture--component-system)
22. [Styling & Design System](#22-styling--design-system)
23. [UX Principles — Personal Finance Context](#23-ux-principles--personal-finance-context)
24. [Charts & Data Visualization](#24-charts--data-visualization)
25. [Forms & Validation](#25-forms--validation)
26. [Accessibility](#26-accessibility)
27. [Performance & Core Web Vitals](#27-performance--core-web-vitals)
28. [Dependency Governance & Upgrades](#28-dependency-governance--upgrades)
29. [Operational Readiness](#29-operational-readiness)
30. [The Commandments — Quick Reference](#30-the-commandments--quick-reference)

---

## 1. Core Principles

These are the load-bearing ideas everything else derives from.

**Make change easy in one place, not many places.** Whether it is a
calculation, a database rule, a component style, a theme token, a form flow, a
job workflow, an error pattern, or a chart behavior — if a change requires
touching unrelated parts of the codebase, that is a structural failure.

**Keep business rules in the domain, side effects at the edges, UI dumb,
and dependencies flowing inward.** Every important path must be observable,
testable, and replaceable.

**Treat financial logic as a domain model, not a pile of CRUD.** Budgeting
systems fail when they are treated as generic admin dashboards. Transaction
categorization, budget rollover, recurring detection, reconciliation, import
deduplication, currency rounding, and date-boundary rules are first-class
domain policy — not incidental implementation details.

**Optimize for readability and replaceability, not cleverness.** Code is read
far more often than it is written. Future-you or a new contributor should be
able to guess where to find something, understand what it does, and know what
is safe to change.

**Separate "what" from "how".** The system should express intent — "create
transaction", "recalculate budget", "sync account" — not just mechanism (SQL,
HTTP, queue jobs, component state). This matters especially when correctness is
more important than brevity.

---

## 2. Repository Structure

Organize by domain concern within `src/lib/`, keeping `src/app/` purely for
routing and page composition. Shared UI lives in `src/components/`, the durable
schema in `src/db/`, and background workflows in `src/inngest/`.

```
src/
├── app/                              # Next.js App Router — routing & page shells only
│   ├── (app)/                        # Authenticated route group
│   │   ├── accounts/
│   │   ├── budgets/
│   │   ├── dashboard/
│   │   ├── settings/
│   │   ├── transactions/
│   │   └── ...
│   ├── api/                          # Route handlers (webhooks, external callbacks)
│   │   ├── auth/
│   │   ├── inngest/
│   │   └── [domain]/                 # One directory per domain surface
│   └── (public)/                     # Unauthenticated routes
│
├── components/                       # Shared UI — zero business logic
│   ├── ui/                           # Base primitives (shadcn-style)
│   ├── layout/                       # App shell, navigation, page chrome
│   ├── charts/                       # Reusable chart wrappers
│   ├── feedback/                     # Toast, EmptyState, ErrorBoundary, Skeleton
│   └── [domain]/                     # Domain-scoped composed components
│
├── db/
│   ├── schema/                       # Drizzle table definitions, one file per domain
│   │   ├── accounts.ts
│   │   ├── transactions.ts
│   │   ├── budgets.ts
│   │   ├── auth.ts
│   │   └── index.ts                  # Re-exports all tables
│   ├── client.ts                     # Neon serverless connection singleton
│   └── migrations/                   # Drizzle Kit migration files
│
├── inngest/
│   ├── client.ts                     # Inngest client instantiation + event type map
│   ├── middleware/                    # Shared job middleware (timeout guards, etc.)
│   └── functions/                    # One file per job or tightly related job group
│       ├── sync-accounts.ts
│       ├── compute-budgets.ts
│       ├── detect-recurring.ts
│       └── ...
│
├── lib/                              # Domain logic, integrations, cross-cutting concerns
│   ├── auth/                         # Auth.js config, session helpers
│   ├── errors/                       # Error types, catalog, API handler wrapper
│   ├── finance/                      # Budget, balance, category, household helpers
│   │   ├── budgets/
│   │   ├── categories/
│   │   ├── merchants/
│   │   └── ...
│   ├── ingestion/                    # Provider-independent types + provider adapters
│   │   ├── types.ts                  # Normalized shapes all providers map into
│   │   ├── [provider-name]/          # One directory per external provider
│   │   └── imports/                  # File-based import adapters
│   ├── security/                     # Arcjet presets, encryption, rate limit helpers
│   ├── logger.ts                     # Structured logger
│   └── [concern].ts                  # Narrow single-purpose utility modules
│
├── hooks/                            # App-wide shared React hooks
├── providers/                        # React context providers
├── config/                           # App constants, validated env vars
├── test/                             # Test infrastructure (mocks, factories, setup)
└── types/                            # Global type augmentations
```

### Structure Rules

1. **Route files are thin shells.** `app/` pages validate params, call domain
   functions, and compose UI. They are not mini-applications.
2. **One-way dependency flow.** `app/ → components/ → lib/`. Never import
   from `app/` into `lib/` or `components/`. Never import from `components/`
   into `lib/`.
3. **`components/` is UI-only.** It must never import from domain modules
   directly. Data flows down as props from server components in `app/`.
4. **Domain modules are self-sufficient.** Each `lib/` domain module owns its
   business rules, types, helpers, and tests. Cross-cutting concerns between
   modules are explicit and limited.
5. **Shared code must be genuinely shared.** A helper belongs in global space
   only if it is used across multiple domains and is stable enough to justify
   reuse. If something is only used by budgets, keep it in the budgets module.
6. **Co-locate tests with the code they test.** Use `.test.ts` siblings or
   `__tests__/` directories within the module.
7. **Background jobs live in their own directory.** Each Inngest function (or
   tightly related group) gets its own file. Job infrastructure (middleware,
   helpers, guards) lives alongside but separate from job definitions.

---

## 3. File Cohesion & Module Decomposition

The most common structural failure in a growing codebase is the **monolithic
file** — a single file that becomes the dumping ground for everything related
to a broad category. This section defines the principles that prevent it.

### The Single Responsibility Heuristic

A file should have **one reason to change.** If a file contains code that
changes for completely different business reasons, it is doing too much.

Ask: "If I described what this file does, would the description use the word
'and' to connect unrelated concepts?" If yes, split it.

- A file containing budget calculation helpers — cohesive.
- A file containing budget calculations AND recurring detection AND merchant
  normalization — not cohesive, split by domain concern.
- A file containing the Inngest function for account sync AND the Inngest
  function for budget recomputation AND shared timeout helpers — not cohesive,
  split by job responsibility.

### When a File Should Be Split

Apply these heuristics to identify files that have outgrown their structure:

1. **Multiple unrelated exports.** If a file exports functions or classes that
   serve different consumers for different purposes, those exports belong in
   separate files.
2. **Mixed abstraction levels.** If a file contains both high-level
   orchestration (a background job definition) and low-level infrastructure
   helpers (timeout guards, retry wrappers), the infrastructure belongs in a
   shared utilities module and the orchestration belongs in its own file.
3. **Length as a symptom.** File length alone is not the rule — a 400-line
   file with a single cohesive concern is fine. But a file approaching many
   hundreds of lines almost always contains multiple concerns that are
   masquerading as one because they share an entry point or category name.
4. **Difficulty naming.** If you cannot name a file more specifically than
   `utils.ts`, `helpers.ts`, or `functions.ts`, it is probably a category, not
   a concept. Categories should be directories; concepts should be files.

### The Directory-Over-File Principle

When a concern grows beyond a single file, promote it to a directory with an
index:

```
# Before: one file doing too much
lib/finance/budgets.ts          # 500 lines: calculations + queries + types

# After: a directory with clear internal structure
lib/finance/budgets/
├── calculations.ts             # Pure budget math
├── queries.ts                  # Database reads
├── mutations.ts                # Database writes
├── types.ts                    # Domain types
└── index.ts                    # Public API re-exports
```

The public API (`index.ts`) controls what the rest of the codebase can depend
on. Internal files can be restructured without breaking consumers.

### Rules for Background Job Organization

Background jobs are especially prone to monolithic accumulation because they
share a registration point. The rules:

- **One file per job or tightly related job group.** "Account sync" is one
  file. "Budget recomputation" is another. They share nothing except the
  Inngest client.
- **Job infrastructure is separate from job definitions.** Timeout guards,
  continuation helpers, rate-limit-pause logic, and shared step patterns
  belong in a middleware or utilities module within the jobs directory — not
  inlined into every job definition and not mixed into one giant file.
- **The registration file is a manifest, not the implementation.** If the
  framework requires a single registration point, that file should import and
  list functions defined elsewhere — not define them inline.

### Rules for Utility Modules

- **No catch-all utility files.** A file named `utils.ts` that contains date
  formatting, currency helpers, string manipulation, and class name merging is
  four unrelated concerns. Split by purpose: `dates.ts`, `currency.ts`,
  `strings.ts`, `cn.ts`.
- **If a utility is domain-specific, it lives in the domain module.** Only
  truly generic, domain-independent helpers belong in a shared utilities
  space.
- **Narrow scope, narrow name.** A utility file should be nameable by its
  single purpose. `format-currency.ts` not `money-helpers.ts`.

### Rules for Client-Side Infrastructure

Client-side fetch wrappers, response parsers, error toast presenters, and
similar concerns should each have their own module. They serve different
purposes and change for different reasons:

- HTTP transport and response parsing — one module.
- Error presentation and toast copy — another module.
- Type-safe API endpoint definitions — potentially another.

Combining them into one "client helper" file couples transport mechanics to UI
presentation logic.

### The Litmus Test

For any file, ask:

- Can I describe its purpose in one sentence without the word "and"?
- Do all the exports serve the same consumer for the same reason?
- If I deleted this file, would the gap it leaves be one concept or many?
- Could a new developer guess what is in this file from its name alone?

If any answer is "no", the file likely needs decomposition.

---

## 4. Dependency Direction & Module Boundaries

### The Dependency Rule

```
app/  →  components/  →  lib/  →  external packages
```

Each layer may only import inward. `lib/` knows nothing about React or
Next.js routing. Components know nothing about database schemas. This makes
domain logic portable and independently testable.

### Boundary Enforcement

- **No circular dependencies.** Domain modules within `lib/` should not
  cross-import each other unless through a narrow, explicit shared type or
  interface. If two modules need to communicate, lift the shared contract up
  or introduce a coordination layer.
- **Keep public interfaces small.** Export only what is truly intended for
  reuse. Large exports mean large coupling surfaces.
- **Isolate third-party SDKs.** Wrap external infrastructure (Arcjet, Sentry,
  Inngest, banking providers) in local adapter modules. If an SDK changes or
  is swapped, the blast radius is one module, not forty files.
- **State flows down, events flow up.** React components receive data as
  props from server components and emit intent via actions or callbacks. They
  do not reach up into parent state or across to sibling features.

### Cross-Cutting Concern Rules

Some code genuinely serves multiple domains: error handling, logging, auth
guards, database connection, encryption. These are legitimate cross-cutting
concerns and belong in their own `lib/` modules. But the bar for something
being "cross-cutting" is high — if it only touches two domains, it may be
better duplicated or explicitly passed than prematurely shared.

---

## 5. Abstraction Philosophy

### When to Abstract

- **Rule of Three.** Do not abstract prematurely. Write it once. Note the
  duplication the second time. Abstract the third time, when you have evidence
  the concept is real and stable.
- **A good abstraction names a business idea.** `calculateBudgetRemaining`,
  `detectDuplicateImportRows`, `normalizeMerchantName`. A bad abstraction
  names an implementation detail.
- **Every abstraction must pay a readability tax.** It must be clearly simpler
  to use than the code it replaced. If a reader needs to jump through three
  files to understand what happens, the abstraction is not earning its keep.
- **Prefer duplication over wrong abstraction.** A bad abstraction is
  significantly harder to unwind than duplicated code.

### Composition Over Configuration

- Prefer composable primitives over mega-components with 40 props.
- Prefer small, focused functions over monolithic orchestration functions.
- Prefer explicit parameters over hidden configuration or ambient state.

### Separate Orchestration from Policy

| Layer | Responsibility |
|-------|---------------|
| Server Actions / Route Handlers | Orchestrate: authenticate, validate, authorize, execute, return |
| Domain Services (`lib/`) | Decide: is this allowed? how is this calculated? what does this mean? |
| Database Queries | Fetch/store: read and write durable state |
| UI Components | Render: display state and emit intent |

A server action that contains financial calculation logic is violating this
separation. A component that decides whether a budget rollover is valid is
violating this separation.

### Favor Pure Functions for Business Rules

Finance logic is much easier to test and trust when expressed as pure
functions: `calculateBudgetRemaining`, `classifyTransaction`,
`computeMonthBoundary`, `detectDuplicateImportRows`, `normalizeAmount`.

Pure logic runs in isolation — no database, no network, no React. This is
where the highest-value unit tests live.

---

## 6. TypeScript Discipline

TypeScript should encode invariants, not merely make autocompletion nicer.
For a finance product, type clarity matters because ambiguity creates bugs in
money, date, and aggregation logic.

### Strictness Is Non-Negotiable

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### Type Rules

- **Infer, don't duplicate.** Derive types from Drizzle schemas and Zod
  schemas. Never write parallel interfaces for the same shape.

```ts
// Types flow from the schema, not the other way around
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
```

- **Zod for runtime boundaries.** All external input (forms, API bodies, env
  vars, webhook payloads) must pass through a Zod schema. Never trust `any`
  from the wire.
- **No `any`, no `as` casts.** Use `satisfies`, `unknown` + narrowing, or
  explicit generics. `any` is acceptable only in truly unavoidable boundary
  glue — and must be commented with justification.
- **Prefer narrow, explicit types over broad "maybe anything" shapes.** A
  function that accepts `Record<string, any>` is hiding its contract.
- **Discriminated unions for state.** Model async states explicitly:

```ts
type QueryState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string };
```

- **Enums as const objects.** Avoid TypeScript `enum`. Use `as const` maps or
  Zod `.enum()`:

```ts
export const BudgetPeriod = {
  MONTHLY: "monthly",
  WEEKLY: "weekly",
  YEARLY: "yearly",
} as const;
export type BudgetPeriod = (typeof BudgetPeriod)[keyof typeof BudgetPeriod];
```

### Strongly Recommended Boundaries for Explicit Types

- Request input validation schemas
- Database row shapes (inferred from Drizzle)
- Internal domain objects
- API response contracts
- Form schemas
- Background job event payloads

### Avoid

- Duplicating the same shape in multiple places
- "Type gymnastics" that make code harder to read than untyped code
- Leaking raw database row types into UI components
- Using raw Tailwind/style types where semantic types would be clearer

---

## 7. Data Layer & Financial Integrity

### Schema Organization

- **One schema file per domain.** Accounts in one file, transactions in
  another, budgets in another. A single index file re-exports all tables.
  This keeps any individual schema file focused and navigable.
- **All money in integer cents.** Never store floats for currency. The display
  layer converts to formatted strings. Rounding rules must be consistent and
  centralized.
- **Audit columns on every table.** `createdAt`, `updatedAt`, ownership
  column (household or user reference).
- **Postgres constraints enforce integrity.** If a budget amount should never
  be negative, enforce it at the database layer. Don't rely on UI validation
  alone.
- **Preserve history.** Financial records should use soft deletes where
  appropriate. Avoid destructive updates where a ledger or event history is
  needed. Reversals and corrections should be representable as new records.
- **Idempotency keys for imports.** Every sync and import path needs
  deduplication — provider transaction IDs, import hashes, or explicit
  idempotency keys.

### Schema Design Philosophy

The schema is the most durable artifact in the system. UI frameworks change,
APIs evolve, background job systems get replaced — but the data model persists
across all of them. Schema design decisions compound over time, so they require
more care than most code decisions.

**Conservative by default.** Do not add columns or tables speculatively for
features that might be built someday. Every column has a maintenance cost:
migration history, null handling in queries, serialization overhead, and
cognitive load for every developer reading the schema. Add schema elements when
a feature that uses them is being built — not before.

**Model the domain, not the screens.** Schema should represent real business
concepts (accounts, transactions, budgets, categories) — not UI layout needs.
A screen is transient; the data model outlasts it. Ask: "Would this entity
still make sense if we rebuilt the entire UI?" If yes, it is a good schema
concept. If it only exists to serve one component's rendering needs, it
probably belongs as derived data, not a table.

**Normalize core entities, denormalize only when it measurably pays off.**
Start normalized. A transaction belongs to an account via a foreign key; a
budget line references a category via a foreign key. Only denormalize (embed,
duplicate, pre-compute) when you have measured evidence that the join cost is a
real bottleneck — and document why the denormalization exists, because it
creates a data consistency obligation.

### When to Create a Separate Table vs. a Column

This is one of the most consequential recurring design decisions. Use these
heuristics:

**Create a separate table when:**

- The data has its own identity (it can be referenced by other entities, it
  has a lifecycle independent of its parent).
- The data is a one-to-many or many-to-many relationship (a transaction has
  multiple tags; an account has multiple sync runs).
- The data could have multiple rows per parent record.
- The data needs its own indexes, constraints, or audit trail.
- The data is shared across multiple parent types (categories are used by
  transactions AND budgets AND rules).
- The data will be queried independently of its parent (e.g., searching all
  merchant aliases without knowing the merchant).

**Keep as a column when:**

- The data is a single scalar attribute of the parent (a transaction's
  `amount`, a budget's `period`).
- There is exactly one value per parent row — never multiple.
- The data always loads with its parent and is never queried independently.
- The data has no identity of its own — it is a property, not an entity.

**Use a JSON/JSONB column when:**

- The data is schemaless metadata that varies per record and does not need to
  be queried, indexed, or joined on (e.g., raw provider response payloads,
  sync run progress checkpoints, provider-specific metadata blobs).
- The data is an implementation detail of one system layer (ingestion metadata)
  that other layers should not depend on structurally.
- You need flexibility during early development before the shape stabilizes —
  but plan to promote to proper columns once the shape is proven.

**Avoid JSON columns when:**

- You need to filter, sort, or aggregate by values inside the JSON. Postgres
  can do this, but it is slower and harder to index than proper columns.
- The data has a stable, known structure that other code depends on for type
  safety. Drizzle's type inference does not penetrate JSON blobs — you lose
  compile-time guarantees.
- Multiple features need to read or write individual fields within the JSON.
  At that point, it is not metadata — it is structured data pretending to be
  unstructured.

### Enum and Finite Value Set Strategies

**Postgres enums vs. text columns with CHECK constraints vs. reference
tables:**

- **Text with CHECK constraint** is usually the best default for small, stable
  value sets (transaction type, budget period, account kind). Easy to add
  values, Drizzle types it correctly, no separate migration for enum updates,
  no join cost.
- **Reference table** (e.g., `categories` table) when the value set is
  user-extensible, has additional metadata (icon, color, sort order), or is
  large/growing. This is a proper entity, not just a label.
- **Postgres native ENUM** works but has migration friction — adding a value
  requires `ALTER TYPE` which cannot be done inside a transaction in older
  Postgres. Use only when the value set is truly fixed and small.

### Schema Evolution & Backward Compatibility

When a new feature requires schema changes and existing records will not have
data for the new columns, follow these principles:

**New columns must be nullable OR have a meaningful default.** Adding a
`NOT NULL` column without a default to a table with existing rows will fail
the migration. Either:
- Make it nullable and handle null in application code (meaning "not yet set"
  or "not applicable").
- Provide a default value that is correct for existing records.
- Backfill existing records as part of the migration (acceptable for small
  tables, risky for large ones).

**Distinguish "not set" from "intentionally empty."** If a column being null
means "the user hasn't configured this yet" — that is different from "the user
explicitly chose no value." Consider whether `null` carries semantic meaning
or is merely an artifact of migration timing. If the distinction matters, use
a nullable column for "not yet set" and a sentinel value or separate boolean
for "intentionally empty."

**Add columns in phases when deploying continuously:**
1. Add the column as nullable (deploy migration).
2. Deploy code that reads the column with a null fallback.
3. Deploy code that writes to the column.
4. (Optional) Backfill old records if needed.
5. (Optional) Add NOT NULL constraint once all records have values.

This prevents the window where deployed code expects a column that doesn't
exist yet, or a constraint that existing data violates.

**Never remove a column that deployed code still reads.** Remove the code
reference first, deploy, then drop the column in a subsequent migration.

**Rename with care.** Column renames break all existing queries. In continuous
deployment, it is safer to add the new column, migrate data, update code, then
drop the old column — rather than a single `ALTER COLUMN RENAME`.

### Avoiding Schema Bloat

At scale, every column and table has a cost: storage, index maintenance,
replication, backup time, and cognitive overhead. Avoid bloat:

**Do not add columns "just in case."** If a feature is not being actively
built, the column should not exist. Migrations are cheap and routine — it is
always safe to add a column when you need it.

**Remove unused columns.** If a feature is deprecated or removed, drop its
columns in a follow-up migration. Dead schema that no code touches is pure
cost.

**Audit for orphaned tables.** Periodically review whether all tables are
actively read and written. Tables created for abandoned features should be
dropped (after confirming no data dependency).

**Keep metadata columns bounded.** JSON metadata columns can grow unboundedly
if not managed. Define what goes into a metadata blob and prune stale keys
during migration or background jobs.

**Evaluate column types for size efficiency.** Use `integer` not `bigint` when
the value range fits. Use `text` not `varchar(n)` in Postgres (they perform
identically, but `varchar` length checks add no storage benefit in Postgres).
Use `timestamp` not `timestamptz` only when you are certain timezone
information is never needed (rarely the case — prefer `timestamptz`).

### Relationship Design

**Foreign keys are mandatory for entity relationships.** Every reference from
one table to another must have a foreign key constraint. This prevents orphan
records, ensures referential integrity, and documents relationships in the
schema itself.

**Choose cascade behavior deliberately:**
- `ON DELETE CASCADE` when child records have no meaning without their parent
  (e.g., budget lines when a budget is deleted).
- `ON DELETE SET NULL` when child records should survive parent deletion but
  lose the reference (e.g., transactions when a category is deleted).
- `ON DELETE RESTRICT` (or no action) when deleting a parent with existing
  children should be prevented (e.g., cannot delete a household with active
  accounts).

**Junction tables for many-to-many.** Never embed arrays of IDs in a column.
Use a proper junction table with foreign keys to both sides. This enables
indexing, constraint enforcement, and additional metadata on the relationship.

**Ownership and tenancy columns on every table that stores user data.**
Every table that stores financial data must have a direct or indirect path to
the household. For core tables, a direct `householdId` column enables
efficient tenant-scoped queries without joining through parent chains. For
child tables that always load with their parent (e.g., budget lines always
load with budgets), the parent's household scope is sufficient — but the
query function must still enforce the scope.

### Ledger Invariants

- Displayed account balances are **always** derived from transaction history.
- If a provider-reported balance cannot be explained by imported transactions,
  maintain a ledger offset transaction rather than storing an unexplained
  balance directly.
- Manual transactions on provider-synced accounts should be flagged because
  they may affect ledger/provider reconciliation.
- Users cannot edit bank-owned transaction facts for synced rows (amount,
  currency, account, date). User enrichment (category, merchant, notes,
  status, budget exclusion) is editable.

### Query Philosophy

- **Keep queries close to the use case.** Named query functions in domain
  modules, not ad hoc database calls sprinkled in route handlers.
- **Always scope by household.** Every query function that touches financial
  data must apply household-scoped WHERE clauses. Never trust the client to
  scope data correctly.
- **Return shapes convenient for the caller.** Don't leak raw table joins
  into the UI unless that is genuinely the right shape.
- **Separate reads from writes.** Keep query functions and mutation functions
  distinct. This aids caching, permissions reasoning, and testing.

### Migration Discipline

- Migrations are part of the product's history. Never rewrite old migrations.
- Ship schema changes in backward-compatible steps when possible.
- Treat destructive changes (column drops, type changes) with extreme care.
  Version large structural changes in phases.
- Every migration is reviewed and committed. No auto-apply in production.
- Name migrations descriptively: `0012_add_budget_rollover_flag.sql`.

---

## 8. Authentication, Authorization & Tenancy

### Non-Negotiable Security Rules

- Every privileged action checks authorization **on the server**.
- Never rely on UI gating for access control. UI hides affordances; the
  server enforces rules.
- Assume client input is hostile. Validate all external inputs.
- Session state is untrusted until verified server-side.

### Mental Model

| Concept | Question |
|---------|----------|
| Authentication | Who are you? |
| Authorization | What may you do? |
| Tenancy | What data can you see? |
| Ownership | What records belong to your household? |
| Role policy | What actions are allowed at your permission level? |

Do not mix these into ad hoc checks scattered through UI code. Use centralized
guard helpers at the top of every server action and route handler.

### Household-Scoped Multi-Tenancy

All financial data is scoped to **households**, not individual users. Users
belong to households via memberships with roles.

- Validate user-supplied foreign keys against the active household before
  writes.
- Never expose records from one household to a user in another.
- Keep user-editable account metadata separate from provider-owned identity
  and raw payload data.

---

## 9. API Layer — Server Actions & Route Handlers

### Server Actions (preferred for mutations)

One action per operation. Every server action follows the same spine:

```
authenticate → validate → authorize → execute → return typed result
```

- **Never throw raw errors to the client.** Return typed result objects
  (`{ data } | { error }`).
- **Server actions are thin controllers.** Their only jobs are: check auth,
  validate input with Zod, call a domain function, handle errors, and return
  the result. No raw SQL or heavy loop manipulation inside the action itself.
- **Rate-limit sensitive actions** via Arcjet before they hit business logic.

### Route Handlers (for webhooks, external integrations)

- Keep in `app/api/`. Use only for things server actions cannot do: webhooks,
  file downloads, SSE, external API callbacks.
- **Wrap with a shared handler utility** that normalizes errors into a
  standard JSON envelope with a request ID.
- **Validate request bodies with Zod.** Let field errors flow through the
  standard error envelope.
- **Validate request signatures** for all inbound webhooks.

---

## 10. Background Jobs — Inngest

### Function Design

- **One function per job.** Each background function gets its own file, named
  for what it does. This is the most important structural rule for preventing
  Inngest code from becoming monolithic.
- **Idempotency is mandatory.** Every function must be safe to run multiple
  times with the same event. Use event IDs or row markers as idempotency keys.
- **Use step functions** for multi-step jobs. Each step is individually
  retried and checkpointed.
- **Type all events** in a central event map for type-safe send calls.

### Serverless Limits & Checkpointing

- Keep long-running work below serverless invocation limits by checkpointing
  progress in durable storage and enqueueing continuation events instead of
  looping unboundedly in one function call.
- Jobs that page through large datasets should process a bounded batch, save
  their cursor, and enqueue themselves for the next batch.
- Treat provider rate limits (HTTP 429) as a paused job. Record progress and
  retry after the specified backoff or a sensible fallback.

### Job Infrastructure Separation

- Shared job concerns — timeout guards, continuation helpers, rate-limit
  pause/resume patterns, step budget checks — belong in a shared middleware
  or utilities module within the jobs directory.
- Job definitions should import these utilities, not inline them. This keeps
  each job file focused on its domain logic, and keeps infrastructure patterns
  consistent and testable independently.

### Job Rules

- Jobs should be idempotent
- Jobs should be retry-safe
- Jobs should log useful context (via the structured logger)
- Jobs should tolerate partial failure gracefully
- Jobs should have clear ownership and replay expectations
- Jobs should not contain UI logic or React dependencies

Think of jobs as **durable workflows**, not "background helpers".

---

## 11. Ingestion & External Provider Integration

### Architecture Principles

External data providers (banking APIs, file imports, future integrations) are
inherently unstable — they rate-limit, change formats, go down, and have
idiosyncratic pagination semantics. The ingestion layer must isolate this
instability from the rest of the system.

- **Define provider-independent normalized shapes.** All providers map their
  data into the same internal format before it touches the ledger. The ledger
  never knows which provider a transaction came from.
- **One directory per provider.** Each external integration gets its own
  subdirectory within the ingestion module. Provider-specific API clients,
  auth flows, response mapping, and error handling are encapsulated there.
- **Provider adapters are replaceable.** Adding a new banking provider should
  mean adding a new directory that implements the normalized interface — not
  modifying the ledger, budget engine, or UI.
- **Pagination must be stateless across runs.** Never seed a new sync run
  from a previous run's cursor. Continuation tokens are scoped to the current
  sync run and its exact request parameters.
- **Sync state is durable.** Track sync progress in the database (not
  in-memory) so the UI can show accurate sync status and jobs can resume
  after interruptions.
- **Initial vs. incremental sync are distinct strategies.** Don't switch to
  incremental windowed sync until a completed initial full-history sync has
  been recorded. This prevents gaps in transaction history.

### File Import Adapters

- File-based imports (CSV, bank exports) follow the same normalized shape
  contract as API-based providers.
- Each file format gets its own adapter. Format detection and adapter
  selection happen through a registry pattern.
- Import adapters are pure functions: file content in, normalized records out.
  No database access, no side effects.

---

## 12. Data Fetching, Caching & Computational Efficiency

Naive data fetching is one of the most common sources of poor performance in
web applications — especially in AI-assisted development where the "obvious"
implementation is often a correct-but-inefficient one. This section defines the
principles for how data should move through the system efficiently, from
database to client and across background processing pipelines.

The core philosophy: **think critically about every data operation.** Every
query, every API call, every transformation should justify its existence. Ask:
is this the minimum work needed to serve this request? Am I doing redundant
work? Am I fetching data I already have? Am I making the database do something
I could compute once and reuse?

### Database Query Efficiency

**Prevent N+1 queries.** The most common performance bug in ORMs. If rendering
a list of N items requires N additional queries to fetch related data, that is
an N+1 pattern. Use joins, subqueries, or batch fetches to load related data
in a single round-trip.

```ts
// Bad: N+1 — one query per budget to get its transactions
const budgets = await getBudgets(householdId);
for (const budget of budgets) {
  budget.spent = await getSpentForBudget(budget.id); // N queries
}

// Good: single query with aggregation
const budgetsWithSpend = await getBudgetsWithCurrentSpend(householdId);
```

**Select only what you need.** Do not `SELECT *` when the consumer only needs
three columns. Over-fetching wastes bandwidth, memory, and serialization time.
Define query return shapes explicitly. This applies equally to Drizzle
`.select()` — specify the columns or use `.columns()`.

**Push computation to the database when appropriate.** Aggregations (SUM,
COUNT, AVG), filtering, sorting, and grouping should happen in SQL, not in
application code. The database has indexes and optimized execution plans. Do
not fetch 10,000 rows to compute a sum in TypeScript.

**Use appropriate query patterns for the access pattern:**
- **Point lookups** (by ID): simple WHERE with index.
- **List views** (paginated): cursor-based or offset pagination with LIMIT.
  Never unbounded.
- **Aggregation dashboards** (totals, trends): pre-computed or materialized
  via background jobs when the source data is large.
- **Search**: use database-level text search (trigram indexes, full-text
  search) rather than fetching all rows and filtering in application code.

**Batch write operations.** When inserting or updating multiple rows (e.g.,
importing transactions), use bulk insert/update operations rather than
individual row-by-row writes. A single `INSERT INTO ... VALUES (...), (...)`
is dramatically faster than 500 individual inserts.

**Index deliberately.** Every column that appears in a WHERE clause, JOIN
condition, or ORDER BY in a frequently-executed query should have an index.
Use `EXPLAIN ANALYZE` to verify query plans before releasing new significant
queries. Missing indexes on financial data tables with growing row counts
cause progressively degrading performance that is invisible until it becomes
critical.

### Page Data Loading Patterns

**Avoid client-side data waterfalls.** A waterfall occurs when sequential
requests depend on each other: fetch user, then fetch their household, then
fetch their accounts, then fetch balances. Each round-trip adds latency.

In the Next.js App Router, the solution is to **colocate data fetching with
the component that needs it** using server components, and let React's
parallel rendering resolve independent data needs concurrently:

```ts
// Bad: sequential waterfall in a single function
async function DashboardPage() {
  const user = await getUser();                    // 50ms
  const accounts = await getAccounts(user.hId);   // 50ms (waits for user)
  const budgets = await getBudgets(user.hId);     // 50ms (waits for accounts)
  // Total: 150ms sequential
}

// Good: parallel fetching of independent data
async function DashboardPage() {
  const user = await getUser();
  const [accounts, budgets, recentTx] = await Promise.all([
    getAccounts(user.householdId),
    getBudgetsWithSpend(user.householdId),
    getRecentTransactions(user.householdId, { limit: 20 }),
  ]);
  // Total: ~50ms (parallel after auth)
}
```

**Fetch at the right granularity.** A page that shows a summary dashboard does
not need full transaction detail. A transaction list page does not need budget
aggregations. Design query functions for specific use cases with appropriate
return shapes — not one "get everything" function that every page calls and
then discards 80% of the result.

**Streaming and Suspense for progressive loading.** For pages with multiple
data-heavy sections, use React Suspense boundaries so fast-loading sections
render immediately while slower sections show skeletons. Don't block the
entire page on the slowest query.

**Avoid redundant re-fetching.** If a page already has data from a server
component, don't re-fetch the same data client-side for an interactive
component. Pass it as props. If client-side mutation invalidates data, use
targeted revalidation (`revalidatePath`, `revalidateTag`) rather than
re-fetching everything.

### API Response Design

**Return exactly what the client needs.** An API endpoint that returns 50
fields when the consuming component uses 5 is wasteful. Design response shapes
purpose-built for their consumers. This does not mean one endpoint per
component — it means thoughtful response contracts that don't over-serve.

**Aggregate on the server, not the client.** If the client needs "total spent
this month by category", the server should return that aggregation — not raw
transactions for the client to sum. This reduces payload size, eliminates
client-side computation, and keeps business logic server-side.

**Paginate all list endpoints.** No endpoint should return unbounded result
sets. Even internal query functions should accept and enforce limits. A
transaction list with no LIMIT clause will eventually return 50,000 rows and
crash the page.

**Use appropriate HTTP caching headers** for responses that are safe to cache.
Static reference data (category lists, currency codes) can be cached
aggressively. User-specific financial data should not be cached in shared
caches but can use short-lived private cache headers or stale-while-revalidate
patterns.

### Caching Strategy

Not all data needs caching. Cache adds complexity (invalidation,
staleness, inconsistency). Apply it deliberately where the cost-benefit is
clear.

**When to cache:**
- Reference data that rarely changes (category lists, currency codes, app
  configuration).
- Expensive aggregations that are read frequently but computed infrequently
  (monthly spending totals, net worth history).
- External API responses with rate limits where the data doesn't change
  faster than the rate limit allows fetching.

**When NOT to cache:**
- User-specific data that must reflect the latest mutation immediately (an
  account balance after adding a transaction).
- Security-sensitive data (session tokens, auth state).
- Data that changes on every access.

**Caching tiers:**

| Data type | Strategy | TTL |
|-----------|----------|-----|
| Static reference data (categories, currencies) | `unstable_cache` / `cache()` or build-time | Long (hours/days) |
| Household-scoped aggregations (dashboard totals) | Background-computed, stored in DB | Fresh on mutation, read from store |
| Per-request deduplication | React `cache()` for server components | Request lifetime |
| Expensive computations within a job | Checkpoint in DB, skip if already done | Job run lifetime |

**Invalidation rules:**
- Tag-based revalidation when a mutation affects cached data. When a
  transaction is created, invalidate the relevant budget and account caches —
  not every cache in the system.
- Prefer narrow invalidation over broad. `revalidateTag("budgets-{hId}")`
  not `revalidatePath("/")`.
- Never serve stale financial data after a user-initiated mutation. If a user
  adds a transaction and sees an outdated balance, they lose trust. Opt for
  no-cache over stale-cache for data that directly follows user writes.

### Background Job Efficiency

**Batch database operations within jobs.** A sync job that inserts
transactions one-by-one across 500 iterations is 500x slower than one that
batches inserts in groups of 50-100. Structure job logic around batch
processing.

**Avoid redundant computation.** If a job processes a list of items and some
have already been processed (e.g., in a previous run or retry), use markers or
idempotency keys to skip already-processed items without re-running their
logic.

**Checkpoint progress for long operations.** A job processing 10,000 rows
should not re-process from the beginning on retry. Record the last
successfully processed cursor/offset in durable storage so retries resume
from the checkpoint, not from zero.

**Minimize database round-trips per step.** Each Inngest step should do its
work in as few database operations as possible. Fetch what you need in one
query, do the computation, write the results in one batch operation. Do not
interleave reads and writes unnecessarily within a single step.

**Pre-filter before processing.** If a job needs to enrich 1,000 transactions
but only 50 actually need enrichment (the rest are already processed), filter
first with a database query rather than fetching all 1,000 and checking each
one in application code.

### Ingestion Pipeline Efficiency

**Normalize once at the boundary.** Raw provider data should be mapped into
the internal normalized format exactly once — at the point of ingestion. All
downstream processing works with the normalized shape. Never re-parse raw
provider responses in multiple places.

**Deduplicate before writing.** Check for existing records before inserting.
Use database-level unique constraints as a safety net, but prefer
application-level dedup checks (batch ID lookups) to avoid triggering
constraint violations on every import retry.

**Process in bounded pages.** Ingestion of large datasets (thousands of
transactions from a provider) should process in bounded pages with checkpoint
semantics. Each page is a complete unit of work — fetch a batch, transform,
write, record progress. This prevents timeout failures and enables efficient
retries.

**Separate fast-path from enrichment.** The initial write of raw normalized
data should be fast and minimal. Enrichment (categorization, merchant
resolution, recurring detection) happens as a subsequent phase — either
inline if fast enough, or as a separate background job if it involves
expensive computation. Don't block the user-visible sync progress on optional
enrichment.

### Anti-Patterns to Actively Avoid

These are the most common efficiency failures, especially in AI-generated
code:

1. **Loop-and-query.** Fetching related data inside a loop instead of joining
   or batching. Every iteration adds a database round-trip.
2. **Fetch-then-filter.** Fetching all rows and filtering in application code
   instead of using WHERE clauses. The database is always faster at filtering.
3. **Serialize-and-discard.** Selecting full rows (all columns) when only an
   ID or a count is needed. Wastes bandwidth and serialization time.
4. **Client-side aggregation.** Sending raw data to the browser for summing
   or grouping instead of computing on the server or in SQL.
5. **Waterfall requests.** Sequential dependent fetches where parallel
   fetches or joins would work.
6. **Cache-everything reflex.** Adding caching layers without measuring
   whether the uncached operation is actually a bottleneck. Cache adds
   complexity; only add it when justified.
7. **Fire-and-forget revalidation.** Mutating data then revalidating
   everything instead of targeting the specific cached paths affected.
8. **Unbounded result sets.** Any query that can return unlimited rows based
   on growing data — no LIMIT, no pagination, no cursor.
9. **Redundant re-computation.** Recomputing derived data on every request
   when it only changes on writes. Budget totals don't change between
   mutations — compute on write, read on request.
10. **Individual inserts in a loop.** Inserting rows one at a time in a for
    loop instead of batch inserting.

### The Efficiency Review Checklist

For every data operation, ask:

- How many database round-trips does this require? Can it be fewer?
- Am I fetching more data than the consumer needs?
- Am I doing computation in application code that the database could do?
- Would this degrade as the dataset grows? (Is it O(n) where O(1) is
  possible?)
- Am I re-fetching data I already have in scope?
- Could this work be done once and reused instead of computed per-request?
- If this runs in a loop, could it be batched?
- Is this cache adding value, or is it premature optimization adding
  complexity?

---

## 13. Security — Arcjet & Runtime Protection

### Application-Level Rate Limiting (Arcjet)

- **Apply Arcjet guards** at the top of public API routes and sensitive server
  actions. Protect against brute-force attacks before any database query.
- **Rate limit by userId (authenticated) and IP (unauthenticated).**
- **Bot detection on public-facing routes.**
- **Shield rules on all mutation endpoints.**
- **Centralize Arcjet rules as named presets** in a single security module.
  Route handlers and actions reference presets by name, not inline rule
  definitions.
- Middleware protects all authenticated app pages and non-public API routes.
  Public exceptions are intentionally narrow and explicitly listed.

### Transport & Encryption

- **All traffic over TLS.** Every connection — browser to server, server to
  database, server to external APIs — uses HTTPS/TLS. Vercel provides this by
  default for edge traffic; ensure Neon database connections also use TLS
  (`sslmode=require`).
- **Application-level field encryption** for stored secrets, provider
  credentials, refresh tokens, and API keys. Use a dedicated encryption module
  with key rotation support. The database stores ciphertext; decryption happens
  only at point of use in server-side code.
- **Production CSP removes `unsafe-eval`.** Content Security Policy headers are
  strict. No inline scripts, no eval, no unsafe sources.
- **Never store secrets, credentials, auth codes, session IDs, key material,
  raw headers, or tokens** in logs, client state, or unencrypted database
  fields.

### Authentication Hardening

- **Multi-factor authentication (MFA) is expected for financial access.**
  Auth.js handles initial authentication; MFA (TOTP or passkey-based) must be
  required for account access. At minimum, support optional MFA with strong
  encouragement; aim for mandatory MFA for any action involving real financial
  connections.
- **Session timeout policy.** Sessions expire after a reasonable inactivity
  window. Re-authentication is required before destructive actions (deleting
  accounts, disconnecting providers, changing email/password).
- **Credential stuffing protection.** Rate-limit login attempts per IP and per
  email. Lock accounts temporarily after repeated failures.
- **OAuth state validation.** All OAuth flows must validate the `state`
  parameter to prevent CSRF on auth callbacks.

### Secrets Lifecycle

- **No hardcoded secrets.** All secrets live in environment variables, backed
  by an encrypted secrets store (Vercel encrypted env vars, or a vault service).
- **Rotation expectations.** Encryption keys, provider API keys, and signing
  secrets must be rotatable without downtime. The application must support
  reading from both old and new keys during a rotation window.
- **Revocation.** When a secret is compromised, there must be a clear path to
  revoke it and re-encrypt affected data. Document this path per secret type.
- **Scope minimization.** Each secret is available only to the services that
  need it. Do not share a single master key across all concerns.

### Data Sensitivity Classification

Not all data requires the same protection level. Classify and treat
accordingly:

| Tier | Examples | Protection |
|------|----------|------------|
| **Critical** | Provider credentials, encryption keys, refresh tokens | Application-level encryption at rest, never logged, never in client state, access-audited |
| **Sensitive** | Account numbers, balances, transaction amounts, PII (email, name) | Household-scoped access, masked in UI by default, TLS in transit, encrypted backups |
| **Internal** | Category assignments, budget configurations, user preferences | Household-scoped access, standard database security, no special encryption |
| **Public** | App configuration, feature flags, category icon names | No access restriction needed |

When adding a new data field, classify it. When in doubt, treat it as
Sensitive until proven otherwise.

---

## 14. Error Handling

A finance platform must never fail silently, and must never expose internal
details to users.

### Three Categories of Errors

| Category | Example | Handling |
|----------|---------|----------|
| Expected business errors | "Transaction already imported", invalid input | Return as typed results. Do not throw. Do not log to Sentry. |
| Unexpected system errors | DB timeout, third-party outage | Log to Sentry with context. Return generic user-safe message. |
| Crashes | Unhandled exceptions | Sentry catches automatically via SDK. |

### Rules

- **Use a typed error catalog** for expected failures. Do not introduce ad hoc
  error response shapes across different routes. All expected errors should
  flow through a consistent factory/class system.
- **Wrap route handlers with a shared handler** that catches errors and
  normalizes them into a standard JSON response envelope.
- **Client code uses a shared response parser** that extracts either data or a
  typed error, and a shared toast presenter that maps error codes to
  human-readable messages.
- **Toast messages must be human-readable and actionable.** Never show raw
  provider, database, token, session, or stack messages to the user.
  "Something went wrong" is unacceptable for financial data. "We couldn't
  save your budget. Your data is safe — please try again." is acceptable.
- **Error boundaries on all major page sections.** A broken chart should not
  crash the whole dashboard.
- Log errors once, not five times across the call stack.

### Important Distinction

Expected business errors are normal control flow. Unexpected system errors are
incident-worthy events. Do not collapse them both into the same handling path.

---

## 15. Logging & Observability

The goal of observability is not noise. It is to answer: what happened, to
whom, where, when, with which input, and in what dependency chain.

### Operational Logging Rules

- Keep routine logs muted. Do not log successful expected actions just because
  they completed.
- **Log deviations:** handled exceptions, provider failures, partial sync
  degradation, failed queues/jobs, suspicious auth/state mismatches, and
  missing server configuration.
- Use a single structured logger module. Never add direct `console.*` calls.
- Include safe operation names and IDs when helpful. Never log secrets,
  credentials, auth codes, session IDs, key material, raw headers, or tokens.
- Prefer structured logs with identifiers over free-form string messages.

### Audit Logging (Distinct from Operational Logging)

Operational logs diagnose system health. **Audit logs** provide an immutable
record of **who did what, when, to which resource.** These serve different
purposes and may have different retention policies.

**What must be audit-logged:**

- All financial mutations: transaction create/edit/delete, account
  connect/disconnect, budget create/modify/delete, balance adjustments.
- Authentication events: login success, login failure, logout, MFA
  challenge/success/failure, session expiry.
- Authorization boundary events: access denied, household membership changes,
  role changes.
- Provider operations: sync initiated, sync completed, sync failed, connection
  created/revoked.
- Destructive actions: account deletion, data export, bulk operations.

**Audit log properties:**

- Immutable once written (append-only).
- Include: timestamp, actor (userId), action, resource type, resource ID,
  household scope, outcome (success/failure), and IP/session context where
  appropriate.
- Stored separately from operational logs if possible (different retention,
  different access controls).
- Never include sensitive field values in audit logs (log "transaction updated"
  not "amount changed from 5000 to 3000").

**Audit logs are not optional for a finance application.** They serve both
internal debugging and potential compliance/dispute resolution needs.

### Sentry Rules

- Use for exceptions, performance tracing, and regression detection.
- Tag events with environment, user segment, feature, route, job name.
- Keep noise low by filtering expected errors (bad user input, known domain
  outcomes).
- Set up spike detection alerts, not per-error alerts.
- Scrub PII (account numbers, full transaction descriptions) before capturing.

### Observability Convention

Every important workflow should be inspectable after the fact: request trace,
validation outcome, DB operation, job execution, and user-visible failure
mode. If you cannot diagnose a failure path, the system is
under-instrumented.

---

## 16. Testing Strategy

Testing should mirror the risk profile. For a finance app, the highest-value
tests protect money math, domain rules, and data isolation.

### Testing Pyramid

```
         /\
        /  \   E2E (Playwright) — critical user journeys only
       /----\
      /      \  Integration (Vitest) — Server Actions, DB queries, auth flows
     /--------\
    /          \ Unit (Vitest) — pure functions, schemas, domain logic
   /____________\
```

### Unit Tests (fast, numerous)

- Test pure domain functions: budget math, categorization rules, date
  boundaries, duplicate detection, recurring matching, currency formatting,
  transformation pipelines, state hashing.
- No mocking needed — pure in, pure out.
- These are where the highest confidence per test-second ratio lives.

### Integration Tests

- Test server actions and query functions with real database state.
- Cover tenant-boundary rules (household scoping) and durable ledger state
  transitions.
- Seed with factory functions, not fixture files.
- Use React Testing Library for client behavior and toast copy.
- Mock external boundaries: banking providers, Sentry, Inngest, NextAuth,
  network fetches.

### E2E Tests (Playwright)

- Reserve for the most valuable paths: onboarding, connect account, create
  budget, view report, import flow.
- Do not cover every UI state with E2E. That is too slow and brittle.

### Testing Rules

- Test the rule, not the implementation detail.
- Test edge cases and failure states, not just the happy path.
- No test should depend on another test's state.
- Keep tests readable — a test is documentation of expected behavior.
- When product behavior changes intentionally, update or remove obsolete
  tests in the same change.
- Avoid redundant CRUD tests after the shared route wrapper is covered. Test
  route-specific rules, ownership boundaries, and durable state transitions.
- Avoid snapshot tests and layout-only assertions.

### Security & Authorization Testing

These tests are **mandatory**, not optional hardening:

- **Every server action must have a household-isolation test.** Prove that
  user A cannot access/modify user B's data by manipulating IDs. This is the
  single highest-value integration test category for a multi-tenant finance
  app.
- **Auth boundary tests.** Prove that unauthenticated requests to protected
  endpoints return 401/403, not data.
- **Foreign key ownership tests.** When a server action accepts an ID
  parameter (accountId, budgetId, transactionId), test that supplying an ID
  from another household is rejected — not silently ignored, not partially
  processed.
- **Rate limit tests.** Verify that Arcjet rules engage on protected endpoints
  when thresholds are exceeded.
- **Input validation tests.** Verify that malformed, oversized, or malicious
  input is rejected by Zod schemas before reaching domain logic.

### Performance Regression Testing

- Critical database queries (dashboard aggregations, transaction list,
  budget calculations) should have performance assertions or at minimum be
  monitored for degradation as data volume grows.
- Introduce seed factories that generate realistic data volumes (hundreds of
  transactions) so performance issues surface in test, not production.

**Heuristic:** If a bug would be expensive or embarrassing in production,
there should be a test that could catch it.

---

## 17. Scalability

"Scalable" means both requests-per-second and human-scale: can new
contributors follow the conventions and add features without breaking
existing ones?

### Technical Scalability

- **Stateless app servers.** No in-process state. No in-memory caches (`Map`
  or arrays in module scope). Background state lives in Inngest/Postgres.
- **Connection pooling via Neon's built-in pooler.** Serverless functions
  exhaust connections fast without pooling.
- **Async jobs for slow tasks.** Keep request-response cycles fast. Offload
  analytics computation, sync, import parsing, model training to Inngest.
- **Pagination and cursoring** for large datasets. Never unbounded queries.
- **Aggregation strategies** for analytics screens — background-computed,
  stored, read stale rather than computing on every request.
- **Add indexes proactively** on columns used in WHERE clauses. Use
  `EXPLAIN ANALYZE` before releasing significant new queries.

### Human Scalability

- Modules with clear ownership and predictable locations.
- Consistent naming conventions that new contributors can follow.
- Small coupling surfaces between modules.
- Obvious error paths.
- Repeatable patterns for new features — not invention for each screen.
- Keep the number of architectural patterns small. Multiple competing
  patterns create confusion.

### Important Rule

Do not optimize for theoretical scale by adding architecture debt. Build the
simplest structure that preserves clean boundaries for business-critical
parts.

---

## 18. Feature Development Governance

### For Every New Feature, Ask

- What domain module does this belong to?
- What is the canonical source of truth?
- What is reusable and what is one-off?
- What state machine does this introduce?
- What is the error path?
- What is the test strategy?
- What background job does it trigger, if any?
- What UI patterns already exist that it should use?

### Feature Development Checklist

Before merging a new feature:

- [ ] Data model changes have migrations written and tested
- [ ] Zod validation schema defined for all inputs
- [ ] Server action follows authenticate → validate → authorize → execute
- [ ] Rate limiting applied where appropriate
- [ ] Error handling uses the typed error catalog
- [ ] Sentry context added to unexpected error captures
- [ ] Unit tests for pure domain logic
- [ ] Integration test for data access and auth boundaries
- [ ] UI has loading, error, and empty states
- [ ] Accessible (keyboard nav, ARIA labels, color contrast)
- [ ] Household-scoped data access verified

### Feature Flags

- Gate in-progress features behind a feature flag (env-var or DB-backed).
- Never merge half-built features behind `// TODO` comments alone.

### Prefer Patterns Over Exceptions

Every exception to established patterns should be justified and documented.
Keep "temporary" code from becoming permanent — label, isolate, and revisit
explicitly.

---

## 19. CI/CD & Deployment Governance

### Deployment Gates

No code reaches production without passing these gates. This is non-negotiable
for a finance application where data integrity failures have real consequences.

**Required gates before merge:**

1. **Lint passes** (`npm run lint`) — no ESLint errors or warnings.
2. **Type check passes** (`npm run typecheck`) — zero TypeScript errors under
   strict mode.
3. **Unit tests pass** (`npm run test`) — all Vitest tests green.
4. **Integration tests pass** — auth boundary and household isolation tests
   green.
5. **Build succeeds** — the production build completes without error.

**Required gates before production deploy:**

6. **Code review** — at least one review on every PR. No self-merging for
   changes touching auth, financial logic, schema migrations, or security
   modules.
7. **Migration review** — schema changes receive explicit review and are never
   auto-applied in production.
8. **Preview deployment** — every PR gets a preview environment for manual
   verification of UI and behavior.

### Pipeline Philosophy

- **Fast feedback.** Lint and typecheck run first (seconds), then unit tests
  (seconds to low minutes), then integration tests (minutes). Fail fast on
  cheap checks before running expensive ones.
- **Reproducible builds.** The same commit always produces the same build
  output. Pin dependencies with a lockfile. Do not rely on floating versions.
- **No manual deploy steps.** Production deployment is triggered by merge to
  main, gated by all checks passing. No SSH, no manual scripts, no "just push
  to prod."
- **Rollback readiness.** Every deployment must be rollback-able to the
  previous version within minutes. Vercel's instant rollback supports this.
  Schema migrations should be backward-compatible so rolled-back code still
  functions.

### Branch Strategy

- `main` is always deployable. It represents production state.
- Feature branches are short-lived (days, not weeks). Long-lived feature
  branches accumulate merge conflicts and integration risk.
- Use feature flags for incomplete features rather than long-lived branches.
- Hotfixes branch from `main`, fix, test, merge back to `main`.

### Migration Deployment

Schema migrations require special care in continuous deployment:

- Migrations deploy **before** the code that depends on them.
- New columns are nullable or have defaults (as specified in Section 7).
- Destructive migrations (drops, renames) happen **after** code no longer
  references the old schema.
- Never run unreviewed migrations against production data.
- Test migrations against a production-like data volume before applying.

---

## 20. Code Readability & Maintenance

### Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Files | kebab-case | `budget-card.tsx` |
| Components | PascalCase | `BudgetCard` |
| Functions | camelCase, verb-first | `getBudgets`, `formatCurrency` |
| Hooks | camelCase, `use` prefix | `useBudgetProgress` |
| Types/Interfaces | PascalCase | `Budget`, `CreateBudgetInput` |
| Constants | SCREAMING_SNAKE | `MAX_BUDGETS_PER_USER` |
| DB tables | snake_case | `budget_categories` |
| Background events | `domain/action.qualifier` | `budgets/budget.created` |
| Zod schemas | PascalCase + `Schema` | `CreateBudgetSchema` |
| Server Actions | camelCase + `Action` | `createBudgetAction` |

### Function Rules

- **Max nesting depth: 3.** Use early returns (guard clauses) to flatten.
- **One level of abstraction per function.** A function that fetches data AND
  formats it AND sends a notification is three functions pretending to be one.
- **Avoid boolean parameters.** They hide intent. Use options objects or
  separate functions.
- **Comment the "why", not the "what".** The code shows what; comments explain
  non-obvious decisions.
- **No commented-out code.** Use git history.
- **JSDoc for public module API functions** — parameters, return type,
  one-liner description.

### The "Always On" Anti-Spaghetti Rules

- **Business rules out of components.** Components display state and emit
  intent. They do not calculate financial policy or coordinate workflows.
- **Data access behind named functions.** No ad hoc database calls in random
  files. Give queries names that reflect the business action.
- **Side effects explicit.** No hidden writes in render paths. No surprise
  network calls in utility functions. No silent mutations of shared objects.
- **File names predictable.** Predictable beats clever. A future developer
  should guess where to find something.
- **State minimal.** Store derived data as derived data, not duplicate state.
  Duplicated state creates sync bugs.
- **One canonical way to do the main thing.** Choose one approach for: server
  mutations, form validation, modal workflows, page data loading, error
  presentation, empty states. Document it. Follow it.

### The Boy Scout Rule

Leave code cleaner than you found it. Every change should include at least
one small cleanup alongside the feature — a renamed variable, an extracted
function, a removed TODO.

---

## 21. UI Architecture — Component System

### Three-Layer Hierarchy

```
Layer 1 — Primitives (components/ui/)
    ↓
Layer 2 — Composed Components (components/ + domain-scoped)
    ↓
Layer 3 — Page Views (app/ pages)
```

**Layer 1 — Primitives:** Stateless, style-only, accessible base pieces.
`Button`, `Input`, `Card`, `Badge`, `Dialog`. These know nothing about
budgets or transactions. They are the atoms.

**Layer 2 — Composed Components:** Combine primitives with data.
`BudgetCard`, `TransactionRow`, `SpendingChart`. May receive data as props.
Domain-scoped components live near the feature they serve; truly shared
composed components live in `components/`.

**Layer 3 — Page Views:** Assembled from Layer 2. Handle routing params,
top-level Suspense/error boundaries. Thin.

### Component Rules

- **Single Responsibility.** A component renders one thing. `BudgetCard`
  renders a budget card; it does not also manage a delete modal.
- **Every interactive component has loading, error, and empty states.** No
  exceptions.
- **Compound components for complex UI patterns** (multi-step forms, dashboard
  widgets, accordion groups):

```tsx
<DashboardCard>
  <DashboardCard.Header title="Monthly Spending" action={<PeriodPicker />} />
  <DashboardCard.Content>
    <SpendingChart data={chartData} />
  </DashboardCard.Content>
  <DashboardCard.Footer status="12% under budget" />
</DashboardCard>
```

- **Separate logic from rendering.** Extract data-fetching and derived state
  into custom hooks. Keep component JSX focused on rendering.
- **Co-locate state with the component that owns it.** Don't lift state higher
  than necessary. Only use React context for truly global concerns (theme,
  user session, feature flags).

### Server vs. Client Components

- **Default to Server Components.** Opt into `"use client"` only for
  interactivity (event handlers, browser APIs, React state/effects).
- **Push the `"use client"` boundary as low as possible.** A page is a Server
  Component; an interactive filter inside it is a Client Component.
- **Fetch data in Server Components.** Pass data down as props. Avoid
  client-side fetching for initial page data.
- For a finance app, many screens can be server-first with small client
  islands for filters, tables, charts, and form controls.

---

## 22. Styling & Design System

### Token-First Styling

All design tokens are CSS custom properties in `globals.css`. Tailwind maps
to these. This means **one change to a CSS variable repaints the entire app.**

```css
:root {
  --color-brand-500: 59 130 246;
  --color-surface-0: 255 255 255;
  --color-surface-50: 248 250 252;
  --color-success: 34 197 94;
  --color-warning: 234 179 8;
  --color-danger: 239 68 68;
  --color-income: 34 197 94;
  --color-expense: 239 68 68;
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
}

.dark {
  --color-surface-0: 10 10 10;
  --color-surface-50: 18 18 18;
  /* ... */
}
```

### Tailwind Conventions

- **`cn()` everywhere for conditional classes.** Never string interpolation.
- **No arbitrary magic values for design tokens.** If writing `text-[#3b82f6]`
  or `p-[13px]`, add it to the token system instead.
- **Variants via `cva` (class-variance-authority).** Define component variants
  in one place, not scattered across conditional class strings.
- **Semantic color names in components.** `bg-brand-*`, `text-success`,
  `border-danger`. Never raw Tailwind palette colors (`text-red-500`) in
  domain components.
- **Mobile-first breakpoints.** `sm:`, `md:`, `lg:` always expand upward.
- **No inline `style={{}}` except** for truly dynamic values Tailwind cannot
  express (chart colors from data, progress percentages).

### Theming Rules

- **Dark mode via `.dark` class** on `<html>` — gives user control beyond
  system preference.
- **Never hardcode colors.** Always use semantic tokens. This is what makes
  theming a single-point-of-change operation.
- **Finance-specific semantic colors:** income (green), expense (red), neutral
  — defined so they work in both light and dark modes.
- Custom theme support (user-selected accent colors) is then trivial — swap a
  few CSS variables.

### Design System Contract

The design system defines: usage intent, allowable variants, interaction
states, accessibility expectations, theming support, responsive behavior, and
composition rules.

**Bad signs:** styling duplicated across many screens, custom CSS exceptions
everywhere, components with dozens of ad hoc props, "just this one screen"
becoming the norm, no documented states.

---

## 23. UX Principles — Personal Finance Context

### Clarity Over Cleverness

Financial data is stressful. The UI must reduce cognitive load, not add to it.

- **Surface the most important number prominently.** Net worth, monthly budget
  remaining, spending vs. target should be the largest visual element.
- **Progressive disclosure.** Show summary, hide detail. Let users drill in.
  Don't dump everything upfront.
- **Labels are sacred.** Never abbreviate financial terms unless universally
  understood. "Net" vs. "Gross" matters.
- **Contextual comparison.** "You spent $420 on dining" is less useful than
  "You spent $420 on dining — 40% over your $300 budget."

### Trust & Safety

- **Confirmation for destructive actions.** Deleting a transaction or budget
  requires explicit confirmation.
- **Optimistic UI with reconciliation.** Optimistic updates feel fast, but
  must roll back visually and explain if the server fails.
- **Audit trail visible to users.** Show "last updated" and "last synced"
  timestamps. Users trust transparent apps.
- **Sensitive data masking.** Account numbers, balances — provide show/hide
  toggle. Default to masked in shared contexts.

### Make States Explicit

Every important component should have intentional states: loading, empty,
error, success, stale, disabled, partial data, syncing, offline/degraded.
Unhandled states breed user confusion and distrust.

### Make Time, Money, and Status Obvious

Users care about: current balance, available balance, pending vs. posted, due
dates, budget period, recurring cycles, last sync time. Hide these, and the
app feels untrustworthy.

### Navigation & Information Architecture

- **Flat hierarchy.** Never more than 2 levels deep in navigation.
- **Persistent navigation.** The sidebar/navbar always shows current section.
- **Consistent back-navigation.** Every detail view has an obvious way back.
- **Global search** for transactions and accounts — essential once a user has
  months of data.

### Prevent Destructive Mistakes

- Confirmations for irreversible actions
- Undo where possible
- Clear affordances for edits
- Safe defaults
- Warnings for high-impact changes

### Consistency Beats Novelty

Users learn patterns fast. Breaking them for novelty damages confidence. Use
the same interaction patterns across the app. One way to create, one way to
edit, one way to delete.

### Locale & Currency Formatting

Currency display, date formatting, and number grouping must respect the user's
locale. Use `Intl.NumberFormat` and `Intl.DateTimeFormat` — never hardcode
currency symbols, decimal separators, or date orderings. A user in Norway
should see `1 234,56 kr`, not `$1,234.56`.

Even if the product currently targets a single locale, build the formatting
layer correctly from the start. Retrofitting locale support into hardcoded
format strings is expensive and error-prone.

---

## 24. Charts & Data Visualization

### Chart Principles

- **Charts should answer a question.** Do not chart for decoration.
- **Wrap every chart library component in a domain-specific component.** Never
  use `<BarChart>` directly in a page — use `<SpendingByCategory />` which
  internally uses the chart library.
- **All chart colors from CSS variables.** Never hardcode hex values in chart
  components. This makes dark mode and theming automatic.
- **Responsive containers always.** Charts must adapt to their container width.
- **Custom tooltips.** Default chart library tooltips are unstyled. Always
  provide a custom tooltip component matching the design system.
- **Graceful empty state.** If data is empty, render a meaningful empty state,
  not a blank or broken chart.
- **Accessibility:** `aria-label` on chart containers, data table alternative
  for screen reader users.

### Financial Chart Conventions

- Green for income/positive, red for expense/negative. This is universal
  financial convention.
- Always label axes with units (months, currency).
- Bar charts for categorical comparisons. Line charts for trends over time.
  Donut/pie sparingly — only for part-of-whole with 6 or fewer segments.

### Analytics UX Rule

Never force the user to decode a chart alone. Pair every chart with:
- Headline metric
- Comparison context (vs. last period, vs. budget)
- Trend direction
- Date range
- Explanation of anomalies when possible

---

## 25. Forms & Validation

### Stack: React Hook Form + Zod

- **One Zod schema per form**, defined in the domain module. Shared between
  client validation and server-side validation.
- **Never duplicate validation logic** between client and server. The Zod
  schema is the single source of truth.
- **Field-level error display** — show errors next to the field, not in a
  banner at the top.
- **Validate on blur, not on change.** Show errors after the user completes a
  field, not while they are typing.

### Financial Form Conventions

- **Smart defaults.** Pre-fill "current month" for date ranges, "monthly" for
  budget period.
- **Currency inputs are special.** Accept various input formats. Normalize on
  blur. Store as integer cents internally.
- **One primary action per screen.** Don't ask users to make two important
  decisions at once.
- **Disable submit button while submitting.** Show a spinner on the button.
- **Reset form on successful submission.** Don't leave stale values.

---

## 26. Accessibility

Accessibility is an architecture rule, not a polish item. It should be baked
into component primitives from the start.

### Non-Negotiables

- WCAG AA minimum — color contrast, keyboard navigation, screen reader labels
- Semantic HTML first
- All interactive elements reachable by keyboard with logical tab order
- Visible focus states
- Label every form control
- Associate errors with fields via `aria-describedby`
- Support reduced motion
- Never convey information by color alone — use icons + color together
- `aria-live` regions for dynamic content updates (budget remaining, totals)
- Focus management in modals — trap focus inside, return to trigger on close

A financially important product must be usable and trustworthy for a broad
range of users. Accessibility failures in a finance app are trust failures.

---

## 27. Performance & Core Web Vitals

### Performance Budgets

Concrete targets to audit against. These are not aspirational — they are
requirements. Violations should be treated as bugs.

| Metric | Target | Rationale |
|--------|--------|-----------|
| LCP (Largest Contentful Paint) | < 2.5s | Google "good" threshold |
| CLS (Cumulative Layout Shift) | < 0.1 | Finance apps need layout stability |
| INP (Interaction to Next Paint) | < 200ms | Interactions must feel instant |
| Initial JS bundle (main route) | < 200 KB gzipped | Prevents bloat creep |
| Critical database queries (dashboard, transaction list) | < 100ms at P95 | Measured under realistic data volume |
| Page data queries per load | Justify any page exceeding 5 queries | Prevents waterfall accumulation |
| Server action response time | < 500ms at P95 | Keeps UI feeling responsive |

### Monitoring Performance Budgets

- Track Core Web Vitals via Vercel Analytics or equivalent real-user monitoring.
- Run Lighthouse CI in the pipeline for key routes. Fail the build if LCP or
  CLS regresses beyond thresholds.
- Monitor database query duration in production. Alert on P95 degradation.
- Review bundle size on dependency additions using `@next/bundle-analyzer`.

### LCP (Largest Contentful Paint)

- Prioritize above-the-fold data. Fetch primary content server-side in Server
  Components, never client-side on page load.
- Use `next/font` for fonts — never load from external CDNs at runtime.
- Reserve explicit dimensions for images and charts.

### CLS (Cumulative Layout Shift)

- **Reserve space for async content.** Use Skeleton components with fixed
  dimensions. CLS in a finance app breeds anxiety — a user trying to click a
  transaction who hits "Delete" due to layout shift will lose trust
  immediately.
- Use `aspect-ratio` on images and charts so they don't reflow on data load.

### INP (Interaction to Next Paint)

- Expensive computations in Server Components or background jobs, not in
  render.
- Virtualize long lists. Transaction lists with hundreds of rows need virtual
  scrolling.
- Debounce search inputs — don't fire a query on every keystroke.

### Bundle Size

- Analyze with `@next/bundle-analyzer` on significant dependency additions.
- Dynamic imports for heavy components (chart libraries, PDF viewers) not
  needed on initial load.
- Named imports from large libraries (`date-fns`, etc.) — never import the
  entire module.

---

## 28. Dependency Governance & Upgrades

### Dependency Rules

- **Every new dependency requires justification.** Ask: could this be done in
  20 lines instead? The cost of a dependency is: bundle size, security
  surface, upgrade burden, and abandonment risk.
- **Audit `package.json` quarterly.** Remove unused dependencies.
- **`npm audit` in CI.** Block PRs with high-severity vulnerabilities.

### Upgrade Strategy

- Automated minor/patch updates via Dependabot/Renovate, auto-merged if CI
  passes.
- Major upgrades treated as a project — scheduled, migration branch, tested
  thoroughly. Never done inside a feature PR.
- Next.js major upgrades tracked against official migration guides.
- **The test suite is your upgrade safety net.** Without integration test
  coverage, major upgrades are terrifying.

---

## 29. Operational Readiness

A finance application that cannot detect, diagnose, and recover from failures
is not production-ready regardless of how clean the code is. This section
defines the operational expectations.

### Health & Availability

- **Health check endpoint.** A lightweight `/api/health` (or equivalent) that
  verifies database connectivity and returns 200. Used by uptime monitoring
  and deployment orchestration.
- **Graceful degradation.** If a non-critical dependency fails (Sentry down,
  Inngest unreachable), the application continues serving users. Log the
  degradation; do not crash the request.
- **Startup checks.** On cold start, verify required environment variables and
  database connectivity. Fail loud and fast if misconfigured — do not serve
  requests in a broken state.

### Alerting Philosophy

- **Alert on symptoms, not causes.** Alert on elevated error rate, elevated
  latency, or failed background jobs — not on individual error occurrences.
- **Spike detection over per-error alerts.** A single 500 is noise. A 10x
  increase in 500s over 5 minutes is an incident.
- **Alert fatigue is a failure mode.** If alerts fire routinely without
  requiring action, they train responders to ignore them. Tune or remove noisy
  alerts.
- **Key metrics to alert on:**
  - Error rate > baseline threshold (e.g., > 1% of requests 5xx)
  - P95 latency exceeds budget for > 5 minutes
  - Background job failure rate spike
  - Sync jobs not completing within expected windows
  - Database connection pool exhaustion

### Incident Response Philosophy

- **Detect → Contain → Fix → Post-mortem.** Every incident follows this
  sequence.
- **Containment first.** If a deployment caused the issue, roll back
  immediately. Investigate after stability is restored.
- **Blameless post-mortems.** After significant incidents, document: what
  happened, timeline, root cause, what prevented faster detection, and
  concrete action items to prevent recurrence.
- **Action items have owners and deadlines.** Post-mortem findings that sit
  in a document unaddressed are theater, not process.

### Backup & Recovery

- **Automated database backups.** Neon provides point-in-time recovery; verify
  it is enabled and understand the recovery window.
- **Test restores.** A backup that has never been tested is not a backup. Test
  restore procedures at least quarterly.
- **Recovery time objective (RTO).** Define how quickly the application must be
  restored after a catastrophic failure. For a personal finance app, hours
  (not days) is the expectation.
- **Recovery point objective (RPO).** Define how much data loss is acceptable.
  With point-in-time recovery, near-zero RPO is achievable.
- **Document the recovery procedure.** When an incident happens at 2 AM, the
  responder should not be reading Neon docs for the first time.

### Deployment Observability

- Every deployment is traceable: which commit, which PR, when deployed, what
  changed.
- Monitor error rates in the 15 minutes after every deployment. If error rate
  spikes, auto-alert and consider automated rollback.
- Preview deployments serve as a smoke test. If preview is broken, production
  deploy is blocked.

---

## 30. The Commandments — Quick Reference

1. **All money in integer cents.** Never float for currency. Ever.
2. **Authenticate, validate, authorize — in that order** — in every server
   action.
3. **All data reads scoped to the active household.** Validate foreign keys
   against that household before writes.
4. **Types flow from schema.** Infer from Drizzle and Zod. Never duplicate
   type definitions.
5. **Every component has three states: loading, error, empty.** No exceptions.
6. **Semantic color tokens, not raw Tailwind colors.** One CSS variable change
   repaints the world.
7. **No `any`. No unvalidated external input past the boundary.** These are
   load-bearing guardrails.
8. **Every background job must be idempotent.** Assume it will run twice.
9. **Never expose internal errors to the client.** Log to Sentry; return a
   safe human message via the error catalog.
10. **Abstract the third time, not the first.** Duplication is cheaper than
    wrong abstraction.
11. **Business rules live in domain modules, not in components or route files.**
    Domain logic is testable in isolation.
12. **Make change easy in one place, not many places.** If a change requires
    touching unrelated modules, the structure has failed.
13. **Provider-owned transaction facts are immutable.** Users may enrich
    (category, merchant, notes, status) but never edit amount, currency,
    account, or date for synced rows.
14. **Log deviations, not successes.** Keep routine noise muted. Make failures
    diagnosable.
15. **One file, one concept.** If a file needs the word "and" to describe its
    contents, it is multiple files.
16. **Minimize round-trips, maximize per-trip value.** Every database query and
    API call should justify its existence. Batch, join, parallelize — never
    loop-and-query.
17. **Every server action has a household-isolation test.** Prove that user A
    cannot access user B's data by manipulating IDs. This is the
    highest-value integration test for multi-tenant finance.
18. **All deployments pass lint, typecheck, and tests. No exceptions.** A
    broken build never reaches production. A skipped test suite is a
    deferred incident.

---

## Mental Model for Every File You Add

Before creating any file, ask:

- Is this UI, domain logic, infrastructure, or shared pure utility?
- Does it belong to one domain module or truly many?
- Is it representing a business concept or an implementation detail?
- Is it testable in isolation?
- Will a new developer know where to look for this later?
- Is this introducing a new pattern, and is that pattern worth the cost?
- Can I describe this file's purpose in one sentence without "and"?

If the answer is unclear, the file probably belongs in a more specific place,
or the abstraction is not ready yet.

---

*This document is a living reference. Update it when conventions evolve, new
patterns are established, or tools change. The goal is not perfect adherence
on day one — it is a shared mental model that keeps the codebase coherent as
it grows, and a concrete checklist for auditing existing code toward
alignment.*
