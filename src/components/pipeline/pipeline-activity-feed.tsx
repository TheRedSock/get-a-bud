"use client";

import { useEffect, useState } from "react";

import { usePipelineLive } from "@/components/pipeline/pipeline-live-context";
import { parseApiResponse } from "@/lib/api-client";

type ActivityItem = {
  id: string;
  kind: string;
  payload?: Record<string, unknown> | null;
  occurredAt: string;
};

export function PipelineActivityFeed({ runId }: { runId: string }) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const { hasActiveRuns } = usePipelineLive();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/pipeline/${runId}`, {
          cache: "no-store",
        });
        const body = await parseApiResponse<{ activities: ActivityItem[] }>(
          response,
        );
        if (!cancelled) {
          setActivities(body.activities ?? []);
        }
      } catch {
        // ignore
      }
    }

    void load();
    if (!hasActiveRuns) return;

    const id = window.setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [runId, hasActiveRuns]);

  if (activities.length === 0) {
    return null;
  }

  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium text-muted-foreground">
        Activity log ({activities.length})
      </summary>
      <ul className="mt-2 grid max-h-40 gap-1 overflow-y-auto text-xs text-muted-foreground">
        {activities.map((item) => (
          <li key={item.id}>
            {(item.payload?.message as string | undefined) ??
              item.kind.replaceAll("_", " ")}
          </li>
        ))}
      </ul>
    </details>
  );
}
