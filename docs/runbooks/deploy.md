# Deploy Runbook

## Ownership

| Gate | Owner |
|------|--------|
| Lint, typecheck, unit tests | GitHub Actions (`ci` job) |
| Production build | GitHub Actions, then Vercel |
| Integration tests | GitHub Actions (`integration` job) |
| Database migrations | Operator via Drizzle (`npm run db:migrate`) |

## Normal deploy (prototype)

1. Merge to `dev` or `main` with green CI.
2. Vercel builds and deploys the target branch automatically.
3. Apply migrations against the target database **before** or with the deploy:
   ```bash
   npm run db:migrate
   ```
4. Watch error rate for 15 minutes after deploy (Sentry / Vercel).

## Preview deploy

Every pull request should receive a Vercel preview URL. Run the [preview verification checklist](./preview-verification.md) before merging risky changes (auth, CSP, ingestion, schema).

## Rollback

See [rollback.md](./rollback.md).
