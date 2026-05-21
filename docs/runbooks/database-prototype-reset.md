# Prototype Database Reset

**Prototype only.** Do not use on production user data.

## When to use

- Squashing migrations after a large schema redesign.
- Recovering a broken local or preview database.

## Steps

1. Stop app processes using the database.
2. Drop and recreate the database (Neon dashboard or local Postgres).
3. Remove old migration artifacts if squashing (team decision).
4. Run migrations from baseline:
   ```bash
   npm run db:migrate
   ```
5. Re-seed demo or test data if needed.
6. Redeploy application code aligned with the new schema.

## Inngest

After reset, stale Inngest runs may reference missing rows. Clear or ignore failed runs in the Inngest dashboard for non-production environments.
