# Inngest Environment Separation

## Rules

- Production Vercel deployment → production Inngest app → production `DATABASE_URL`.
- Preview deployments must **not** receive production Inngest events unless intentionally configured.
- Local dev uses Inngest Dev Server with `INNGEST_ENV=development` in `.env.local`.

## Vercel variables

Per `.env.example`:

- Vercel integration sets `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.
- Do **not** set `INNGEST_ENV` on Vercel preview/production unless following a deliberate branch-routing policy.

## Scheduled jobs (cron)

`scheduled-bank-sync` and `pipeline-maintenance` register an Inngest cron only when
`INNGEST_SCHEDULED_CRONS_ENABLED=true` on the deployment. With the variable unset,
runs are manual only: Inngest → Functions → choose the function → **Invoke** (empty `{}` payload).

To turn schedules back on, set `INNGEST_SCHEDULED_CRONS_ENABLED=true` in Vercel for the
target environment and redeploy.

## Verification

1. Open Inngest dashboard → Apps → confirm which deployment URL is registered.
2. Trigger a test event from staging only and confirm it runs against staging data.
3. After [database restore](./backup-restore.md), never point a restored clone at production Inngest keys.

See `src/inngest/client.ts` for client configuration comments.
