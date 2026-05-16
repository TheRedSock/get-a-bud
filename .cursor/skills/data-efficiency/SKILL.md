---
name: data-efficiency
description: Use when writing database queries, data fetching logic, caching, page data loading patterns, or optimizing data operations. Covers N+1 prevention, query efficiency, caching strategy, API response design, and common anti-patterns.
---

# Data Fetching, Caching & Computational Efficiency

Source: `docs/philosophy.md` section 12 (Data Fetching, Caching &
Computational Efficiency).

Core philosophy: **think critically about every data operation.** Every query,
API call, and transformation should justify its existence. Ask: is this the
minimum work needed to serve this request?

## Database Query Efficiency

- **Prevent N+1 queries.** If rendering N items requires N additional queries,
  use joins, subqueries, or batch fetches for a single round-trip.

```ts
// Bad: N+1
const budgets = await getBudgets(householdId);
for (const budget of budgets) {
  budget.spent = await getSpentForBudget(budget.id); // N queries
}

// Good: single query with aggregation
const budgetsWithSpend = await getBudgetsWithCurrentSpend(householdId);
```

- **Select only what you need.** No `SELECT *` when the consumer needs three
  columns. Specify columns in Drizzle `.select()` or `.columns()`.
- **Push computation to the database.** Aggregations (SUM, COUNT, AVG),
  filtering, sorting, grouping in SQL — not in TypeScript.
- **Batch write operations.** Single `INSERT ... VALUES (...), (...)` is
  dramatically faster than 500 individual inserts.
- **Index deliberately.** Every column in WHERE, JOIN, or ORDER BY of a
  frequent query should have an index. Use `EXPLAIN ANALYZE` to verify.

### Query Pattern Selection

| Access pattern | Query approach |
|---------------|---------------|
| Point lookup (by ID) | Simple WHERE with index |
| List view (paginated) | Cursor-based or offset with LIMIT. Never unbounded. |
| Dashboard aggregation | Pre-computed via background jobs for large datasets |
| Search | Database-level text search, not fetch-all-and-filter |

## Page Data Loading

- **Avoid client-side waterfalls.** Don't fetch sequentially when requests
  are independent. Use `Promise.all()` for parallel fetching:

```ts
// Bad: 150ms sequential
const user = await getUser();
const accounts = await getAccounts(user.hId);     // waits for user
const budgets = await getBudgets(user.hId);        // waits for accounts

// Good: ~50ms parallel after auth
const user = await getUser();
const [accounts, budgets, recentTx] = await Promise.all([
  getAccounts(user.householdId),
  getBudgetsWithSpend(user.householdId),
  getRecentTransactions(user.householdId, { limit: 20 }),
]);
```

- **Fetch at the right granularity.** A summary dashboard does not need full
  transaction detail. Design query functions for specific use cases.
- **Streaming and Suspense** for progressive loading. Fast sections render
  immediately while slower sections show skeletons.
- **Avoid redundant re-fetching.** If a server component already has data,
  pass it as props instead of re-fetching client-side. Use targeted
  `revalidatePath`/`revalidateTag` after mutations.

## API Response Design

- **Return exactly what the client needs.** 50 fields when 5 are used is waste.
- **Aggregate on the server.** "Total spent by category" = server-computed
  aggregation, not raw transactions for client-side summing.
- **Paginate all list endpoints.** No unbounded result sets. Even internal
  query functions enforce limits.

## Caching Strategy

Not all data needs caching. Cache adds complexity. Apply deliberately.

**When to cache:**
- Reference data that rarely changes (categories, currencies, config)
- Expensive aggregations read frequently, computed infrequently
- External API responses with rate limits

**When NOT to cache:**
- User-specific data that must reflect latest mutation immediately
- Security-sensitive data (sessions, tokens)
- Data that changes on every access

| Data type | Strategy | TTL |
|-----------|----------|-----|
| Static reference (categories, currencies) | `unstable_cache` / build-time | Hours/days |
| Household aggregations (dashboard totals) | Background-computed, stored in DB | Fresh on mutation |
| Per-request deduplication | React `cache()` | Request lifetime |
| Expensive job computation | Checkpoint in DB | Job run lifetime |

**Invalidation rules:**
- Tag-based revalidation on mutation. Budget cache invalidated when transaction
  created — not every cache in the system.
- Narrow invalidation: `revalidateTag("budgets-{hId}")` not `revalidatePath("/")`.
- Never serve stale financial data after a user-initiated mutation.

## Anti-Patterns to Actively Avoid

1. **Loop-and-query.** Fetching related data inside a loop. Each iteration
   adds a round-trip.
2. **Fetch-then-filter.** Fetching all rows and filtering in application code
   instead of WHERE clauses.
3. **Serialize-and-discard.** Selecting full rows when only an ID or count
   is needed.
4. **Client-side aggregation.** Sending raw data to browser for summing.
5. **Waterfall requests.** Sequential fetches where parallel would work.
6. **Cache-everything reflex.** Caching without measuring the bottleneck.
7. **Fire-and-forget revalidation.** Mutating then revalidating everything.
8. **Unbounded result sets.** No LIMIT, no pagination, no cursor.
9. **Redundant re-computation.** Recomputing derived data on every request
   when it only changes on writes.
10. **Individual inserts in a loop.** Row-by-row instead of batch insert.

## Efficiency Review Checklist

For every data operation, ask:

- [ ] How many database round-trips? Can it be fewer?
- [ ] Am I fetching more data than the consumer needs?
- [ ] Am I doing computation that the database could do?
- [ ] Would this degrade as the dataset grows? (O(n) where O(1) is possible?)
- [ ] Am I re-fetching data I already have in scope?
- [ ] Could this be computed once and reused instead of per-request?
- [ ] If this runs in a loop, could it be batched?
- [ ] Is this cache adding value, or premature optimization adding complexity?
