import { inngest } from "@/inngest/client";
import {
  parseJobEvent,
  pipelineMaintenanceSchema,
} from "@/inngest/lib/event-validation";
import {
  EVENT_NAMES,
  pipelineMaintenanceEvent,
} from "@/inngest/lib/events";
import {
  PIPELINE_MAINTENANCE_CRON,
  scheduledJobTriggers,
} from "@/inngest/lib/scheduled-triggers";
import {
  markStalePipelineRunsFailed,
  pruneOldActivityEvents,
} from "@/lib/ingestion/pipeline/runs";

export const pipelineMaintenance = inngest.createFunction(
  {
    id: "pipeline-maintenance",
    name: "Pipeline maintenance",
    triggers: scheduledJobTriggers(
      pipelineMaintenanceEvent,
      PIPELINE_MAINTENANCE_CRON,
    ),
  },
  async ({ event, step }) => {
    parseJobEvent(pipelineMaintenanceSchema, event.data, {
      eventName: EVENT_NAMES.pipelineMaintenance,
    });
    await step.run("mark-stale-runs-failed", () =>
      markStalePipelineRunsFailed(),
    );

    await step.run("prune-activity-events", () => pruneOldActivityEvents(7));

    return { ok: true };
  },
);
