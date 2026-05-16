---
name: ingestion
description: Use when working on src/lib/ingestion/, Enable Banking integration, bank sync, provider adapters, file imports, or transaction ingestion pipelines. Covers provider isolation, normalized shapes, sync state, and import deduplication.
---

# Ingestion & External Provider Integration

Source: `docs/philosophy.md` section 11 (Ingestion & External Provider
Integration) and ingestion-specific efficiency rules from section 12.

External data providers are inherently unstable — they rate-limit, change
formats, go down, and have idiosyncratic pagination. The ingestion layer
isolates this instability from the rest of the system.

## Architecture Rules

- **Provider-independent normalized shapes.** All providers map into the same
  internal format before touching the ledger. The ledger never knows which
  provider a transaction came from. Shapes defined in `src/lib/ingestion/types.ts`.
- **One directory per provider.** Each external integration gets its own
  subdirectory. Provider-specific API clients, auth flows, response mapping,
  and error handling are encapsulated there.
- **Provider adapters are replaceable.** Adding a new banking provider means
  adding a new directory implementing the normalized interface — not modifying
  the ledger, budget engine, or UI.
- **Normalize once at the boundary.** Raw provider data maps into the internal
  format exactly once, at the point of ingestion. All downstream processing
  uses the normalized shape. Never re-parse raw provider responses elsewhere.

## Sync State Management

- **Sync state is durable.** Track sync progress in the database (not
  in-memory) so the UI can show accurate sync status and jobs can resume
  after interruptions.
- **Pagination must be stateless across runs.** Never seed a new sync run from
  a previous run's cursor. Continuation tokens are scoped to the current sync
  run and its exact request parameters.
- **Initial vs. incremental sync are distinct strategies.** Do not switch to
  incremental windowed sync until a completed initial full-history sync has
  been recorded. This prevents gaps in transaction history.

## Enable Banking Specifics

- Keep request parameters stable while following `continuation_key` until it
  is absent, even when a page contains no transactions.
- Continuation keys are scoped to the current sync run and request parameter
  set; never seed a new run from an old provider account cursor.
- Do not switch to incremental date-window sync until a completed initial
  `strategy=longest` transaction sync has been recorded on the connection
  metadata.
- Treat `ASPSP_RATE_LIMIT_EXCEEDED` or HTTP 429 as a paused sync. Record
  progress and retry after the provider retry time or a six-hour fallback.

## File Import Adapters

- File imports follow the same normalized shape contract as API providers.
- Each file format gets its own adapter. Format detection through a registry.
- Import adapters are **pure functions**: file content in, normalized records
  out. No database access, no side effects.

## Ingestion Efficiency

- **Deduplicate before writing.** Check for existing records before inserting.
  Use database-level unique constraints as a safety net, but prefer
  application-level dedup checks (batch ID lookups) to avoid triggering
  constraint violations on every retry.
- **Process in bounded pages.** Large datasets process in bounded pages with
  checkpoint semantics. Each page: fetch batch, transform, write, record
  progress. Prevents timeout failures, enables efficient retries.
- **Separate fast-path from enrichment.** Initial write of raw normalized data
  should be fast and minimal. Enrichment (categorization, merchant resolution,
  recurring detection) happens as a subsequent phase — inline if fast enough,
  separate background job if expensive. Don't block user-visible sync progress
  on optional enrichment.
- **Batch database operations.** Bulk insert/update, not row-by-row writes.

## Ledger Rules (from ingestion perspective)

- Keep user-editable account metadata on `financial_accounts` separate from
  provider identity and raw payload data on `provider_accounts`.
- Provider-owned transaction facts are immutable (amount, currency, account,
  date). User enrichment (category, merchant, notes, status) is editable.
- If provider history is incomplete, maintain a ledger offset transaction
  rather than writing an unexplained balance directly.

## Self-Audit Checklist

Before completing ingestion work, verify:

- [ ] Provider-specific code is encapsulated in provider directory
- [ ] All data maps through normalized shapes before touching the ledger
- [ ] Sync state persisted in database, not in-memory
- [ ] Pagination tokens scoped to current run, not carried between runs
- [ ] Deduplication logic in place (idempotency keys or provider IDs)
- [ ] Database writes are batched, not row-by-row
- [ ] Enrichment does not block the fast sync path
- [ ] Rate limits handled gracefully (pause + record progress + retry)
- [ ] File import adapters are pure functions (no side effects)
- [ ] Provider-owned transaction facts preserved as immutable
