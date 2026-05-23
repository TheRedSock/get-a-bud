---
name: schema-data
description: Use when working on src/db/, schema.ts, migrations, query functions, or database design. Covers schema design philosophy, ledger invariants, migration discipline, relationship design, and query patterns.
---

# Schema & Data Layer

Source: `docs/philosophy.md` sections 7 (Data Layer & Financial Integrity).

The schema is the most durable artifact in the system. UI frameworks change,
APIs evolve, background job systems get replaced — but the data model persists
across all of them. Apply more care here than in most code decisions.

## Schema Design Rules

- **One schema file per domain.** Accounts, transactions, budgets each get
  their own file. A single `index.ts` re-exports all tables.
- **All money in integer cents.** Never store floats for currency. The display
  layer converts to formatted strings. Rounding rules are centralized.
- **Audit columns on every table.** `createdAt`, `updatedAt`, ownership column
  (household or user reference).
- **Postgres constraints enforce integrity.** If a budget amount must never be
  negative, enforce it at the database layer — not only in UI validation.
- **Preserve history.** Financial records use soft deletes where appropriate.
  Reversals and corrections are representable as new records, not destructive
  updates.
- **Idempotency keys for imports.** Every sync and import path needs
  deduplication — provider transaction IDs, import hashes, or explicit
  idempotency keys.

## Schema Design Philosophy

- **Conservative by default.** Do not add columns speculatively. Every column
  has a maintenance cost: migration history, null handling, serialization
  overhead, cognitive load. Add when a feature that uses it is being built.
- **Model the domain, not the screens.** "Would this entity still make sense if
  we rebuilt the entire UI?" If yes, it is a good schema concept.
- **Normalize core entities, denormalize only when measurably justified.**
  Start normalized. Only denormalize with measured evidence of a join bottleneck,
  and document why.

## When to Create a Table vs. a Column

**Separate table when:**
- Data has its own identity or lifecycle independent of its parent
- One-to-many or many-to-many relationship
- Data needs its own indexes, constraints, or audit trail
- Data is shared across multiple parent types
- Data will be queried independently of its parent

**Keep as column when:**
- Single scalar attribute of the parent (never multiple values)
- Always loads with its parent, never queried independently
- No identity of its own — it is a property, not an entity

**JSON/JSONB column when:**
- Schemaless metadata that varies per record, not queried/indexed/joined on
- Implementation detail of one system layer (e.g. raw provider payloads)
- Shape is unstable during early development — plan to promote to columns later

**Avoid JSON when:**
- You need to filter, sort, or aggregate by values inside it
- Shape is stable and other code depends on it for type safety
- Multiple features read/write individual fields within it

## Enum Strategies

- **Text + CHECK constraint** (default for small stable sets): transaction type,
  budget period, account kind. Easy to add values, Drizzle types correctly.
- **Reference table** when value set is user-extensible, has metadata (icon,
  color), or is large/growing.
- **Postgres ENUM** only for truly fixed, small sets (migration friction).

## Relationship Design

- **Foreign keys are mandatory.** Every reference between tables must have an FK
  constraint. No orphan records.
- **Cascade behavior chosen deliberately:**
  - `CASCADE` — child meaningless without parent (budget lines when budget deleted)
  - `SET NULL` — child survives, loses reference (transactions when category deleted)
  - `RESTRICT` — prevent deletion with existing children (household with accounts)
- **Junction tables for many-to-many.** Never embed arrays of IDs in a column.
- **Ownership columns on every user-data table.** Direct or indirect path to
  household. Core tables get a direct `householdId` for efficient tenant queries.

## Ledger Invariants

- Displayed account balances are **always** derived from transaction history.
- If a provider-reported balance cannot be explained by imported transactions,
  maintain a ledger offset transaction — never an unexplained balance.
- Manual transactions on synced accounts are flagged for reconciliation.
- Users cannot edit bank-owned transaction facts for synced rows (amount,
  currency, account, date). User enrichment (category, merchant, notes, status)
  is editable.

## Query Philosophy

- **Named query functions in domain modules.** No ad hoc database calls in
  route handlers.
- **Always scope by household.** Every query touching financial data applies
  household-scoped WHERE clauses.
- **Return shapes convenient for the caller.** Don't leak raw table joins into UI.
- **Separate reads from writes.** Distinct query and mutation functions.

## Schema Evolution

- New columns must be **nullable OR have a meaningful default.**
- Distinguish "not set" from "intentionally empty" when null carries meaning.
- Add columns in phases for continuous deployment:
  1. Add nullable column (deploy migration)
  2. Deploy code that reads with null fallback
  3. Deploy code that writes
  4. Backfill if needed
  5. Add NOT NULL constraint once all records populated
- Never remove a column that deployed code still reads. Remove code first.
- Column renames: add new column, migrate data, update code, drop old column.

## Migration Discipline

- **Never hand-write migration SQL, journal entries, or snapshot files.**
  Always run `npm run db:generate` to let drizzle-kit produce migrations from
  schema diffs. Manually created files under `src/db/migrations/` (including
  `meta/_journal.json` and `meta/NNNN_snapshot.json`) break drizzle-kit's state
  tracking and cause duplicate or conflicting migrations.
- Migrations are part of history. Never rewrite old migrations.
- Ship schema changes in backward-compatible steps.
- Treat destructive changes (drops, type changes) with extreme care.
- Every migration is reviewed and committed. No auto-apply in production.
- Workflow: schema change → `npm run db:generate` → review SQL → commit
  migration + snapshot + journal together.

## Avoiding Schema Bloat

- No speculative columns. Add when the feature is being built.
- Remove unused columns when features are deprecated.
- Audit for orphaned tables periodically.
- Keep JSON metadata columns bounded. Prune stale keys.
- Use appropriate column types for size efficiency.

## Self-Audit Checklist

Before completing schema work, verify:

- [ ] Every table has audit columns (`createdAt`, `updatedAt`)
- [ ] All money stored as integer cents
- [ ] Foreign keys present for all entity references
- [ ] Cascade behavior explicitly chosen and appropriate
- [ ] Financial data tables have household scoping (direct or via parent)
- [ ] New columns are nullable or have defaults for existing rows
- [ ] Migration is backward-compatible with currently deployed code
- [ ] No speculative columns for unbuilt features
- [ ] Types inferred from Drizzle schema, not manually duplicated
- [ ] Query functions scope by household and return caller-appropriate shapes
