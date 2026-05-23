import { cron } from "inngest";

import { inngest } from "@/inngest/client";
import {
  markStalePipelineRunsFailed,
  pruneOldActivityEvents,
} from "@/lib/ingestion/pipeline/runs";

export const pipelineMaintenance = inngest.createFunction(
  {
    id: "pipeline-maintenance",
    name: "Pipeline maintenance",
    triggers: cron("0 4 * * *"),
  },
  async ({ step }) => {
    await step.run("mark-stale-runs-failed", () =>
      markStalePipelineRunsFailed(),
    );

    await step.run("prune-activity-events", () => pruneOldActivityEvents(7));

    return { ok: true };
  },
);
