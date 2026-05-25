import { cron } from "inngest";

/** Every 6 hours — used when `INNGEST_SCHEDULED_CRONS_ENABLED=true`. */
export const SCHEDULED_BANK_SYNC_CRON = "0 */6 * * *";

/** Daily 04:00 UTC — used when `INNGEST_SCHEDULED_CRONS_ENABLED=true`. */
export const PIPELINE_MAINTENANCE_CRON = "0 4 * * *";

const scheduledCronsEnabled =
  process.env.INNGEST_SCHEDULED_CRONS_ENABLED === "true";

/**
 * Manual event trigger always; cron only when `INNGEST_SCHEDULED_CRONS_ENABLED=true`.
 * Omit the env var (or set any other value) to run jobs from the Inngest UI only.
 */
export function scheduledJobTriggers<TManual extends object>(
  manualEvent: TManual,
  schedule: string,
): TManual | [TManual, ReturnType<typeof cron>] {
  if (!scheduledCronsEnabled) {
    return manualEvent;
  }
  return [manualEvent, cron(schedule)];
}
