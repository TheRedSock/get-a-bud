# Backup and Restore

## Neon point-in-time recovery

- Confirm PITR is enabled on the Neon project.
- **RPO:** near-zero when PITR is enabled.
- **RTO:** target hours, not days, for a personal finance app.

## Quarterly restore drill

1. Create a branch or clone from a PITR timestamp in an **isolated** Neon branch.
2. Point a staging deployment at the restored branch only.
3. Disable or use a separate Inngest dev environment so restored DB does not consume production events.
4. Verify sign-in, household scoping, and sample transaction reads.
5. Document date, operator, and outcome below.

### Drill log

| Date | Operator | Result |
|------|----------|--------|
| _pending_ | | |
