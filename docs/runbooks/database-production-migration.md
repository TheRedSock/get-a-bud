# Production Migration Policy (future)

When the app has real users, use phased migrations only:

1. Add nullable columns or new tables.
2. Deploy code that reads with null fallbacks.
3. Deploy code that writes new fields.
4. Backfill if required.
5. Add constraints in a later migration after backfill completes.

Destructive changes (drop column/table) happen only after code no longer references them.

Require manual review for any non-additive migration.
