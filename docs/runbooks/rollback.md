# Rollback Runbook

## Vercel instant rollback

1. Open the Vercel project → Deployments.
2. Select the last known-good production deployment.
3. Promote to production (instant rollback of application code).

## Database caution

Rollback of **application code** does not rollback **schema**. If the failed deploy included a migration:

- Prefer forward-fix migration if data was already written under the new schema.
- If the migration was additive and nullable, rolled-back code should still run.
- Destructive migrations require [failed-migration.md](./failed-migration.md) and possibly restore from backup.

## Verification after rollback

- `/api/health` returns 200 with database connected.
- Sign-in works.
- Dashboard loads for a test household.
