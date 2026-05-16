---
name: background-jobs
description: Use when working on src/inngest/, background functions, sync jobs, compute jobs, or scheduled tasks. Covers Inngest function design, idempotency, step functions, serverless limits, and job infrastructure separation.
---

# Background Jobs — Inngest

Source: `docs/philosophy.md` section 10 (Background Jobs) and job efficiency
rules from section 12.

Think of jobs as **durable workflows**, not "background helpers".

## Function Design

- **One file per job or tightly related job group.** "Account sync" is one
  file. "Budget recomputation" is another. They share nothing except the
  Inngest client. This is the most important structural rule for preventing
  Inngest code from becoming monolithic.
- **Idempotency is mandatory.** Every function must be safe to run multiple
  times with the same event. Use event IDs or row markers as idempotency keys.
- **Use step functions** for multi-step jobs. Each step is individually retried
  and checkpointed.
- **Type all events** in a central event map for type-safe send calls.

## Serverless Limits & Checkpointing

- Keep long-running work below serverless invocation limits by checkpointing
  progress in durable storage and enqueueing continuation events instead of
  looping unboundedly in one function call.
- Jobs paging through large datasets should process a bounded batch, save
  their cursor, and enqueue themselves for the next batch.
- Treat provider rate limits (HTTP 429) as a paused job. Record progress and
  retry after the specified backoff or a sensible fallback.

## Job Infrastructure Separation

- Shared job concerns — timeout guards, continuation helpers, rate-limit
  pause/resume patterns, step budget checks — belong in a shared middleware
  or utilities module within the jobs directory.
- Job definitions import these utilities; they do not inline them.
- The registration file is a manifest, not the implementation. If the framework
  requires a single registration point, it imports and lists functions defined
  elsewhere.

## Job Efficiency

- **Batch database operations.** A sync job inserting transactions one-by-one
  across 500 iterations is 500x slower than batching in groups of 50-100.
- **Skip already-processed items.** Use markers or idempotency keys to avoid
  re-running logic for items processed in a previous run or retry.
- **Checkpoint progress for long operations.** Record the last successfully
  processed cursor/offset in durable storage. Retries resume from the
  checkpoint, not from zero.
- **Minimize database round-trips per step.** Fetch in one query, compute,
  write in one batch. Don't interleave reads and writes within a single step.
- **Pre-filter before processing.** If only 50 of 1,000 items need enrichment,
  filter with a database query first rather than fetching all and checking each.

## Job Rules

- Jobs must be idempotent
- Jobs must be retry-safe
- Jobs must log useful context (via the structured logger)
- Jobs must tolerate partial failure gracefully
- Jobs must have clear ownership and replay expectations
- Jobs must not contain UI logic or React dependencies

## Self-Audit Checklist

Before completing background job work, verify:

- [ ] One file per job (or tightly related group)
- [ ] Function is idempotent — safe to run twice with the same event
- [ ] Multi-step work uses Inngest step functions for checkpointing
- [ ] Events typed in the central event map
- [ ] Long operations checkpoint progress in durable storage
- [ ] Large dataset processing uses bounded batches with continuation events
- [ ] Database operations batched (not row-by-row in loops)
- [ ] Rate limits handled (pause, record progress, retry after backoff)
- [ ] Infrastructure helpers are imported from shared modules, not inlined
- [ ] No UI logic or React dependencies in job code
- [ ] Job logs useful context for debugging via structured logger
