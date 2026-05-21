import { inngest } from "@/inngest/client";
import {
  notificationBatchSchema,
  parseJobEvent,
} from "@/inngest/lib/event-validation";
import { EVENT_NAMES, notificationBatchEvent } from "@/inngest/lib/events";

export const notificationBatch = inngest.createFunction(
  {
    id: "notification-batch",
    name: "Notification batch",
    triggers: notificationBatchEvent,
  },
  async ({ event }) => {
    parseJobEvent(notificationBatchSchema, event.data, {
      eventName: EVENT_NAMES.notificationBatch,
    });
    return { queued: 0, note: "Notification delivery is deferred." };
  },
);
