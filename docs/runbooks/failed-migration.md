# Failed Migration Recovery

1. **Stop deploys** until the database state is understood.
2. Capture the failing migration name and Postgres error from CI or `drizzle-kit migrate` output.
3. If the migration partially applied, inspect `__drizzle_migrations` and affected tables.
4. Choose one path:
   - **Forward fix:** new migration that repairs state (preferred when data exists).
   - **Restore:** point-in-time recovery (see [backup-restore.md](./backup-restore.md)) for catastrophic failure.
5. Never edit applied migration files in place; add a new migration instead.
6. Re-run migrate in a staging clone before production.
