"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";

export type SyncRun = {
  id: string;
  connectionId: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "rate_limited";
  startedAt: string | null;
  finishedAt: string | null;
  importedAccounts: number;
  importedTransactions: number;
  errorCode: string | null;
  errorMessage: string | null;
};

type ConnectionRef = {
  id: string;
};

function isActiveRun(run: SyncRun | null | undefined) {
  return run?.status === "queued" || run?.status === "running";
}

function terminalMessage(run: SyncRun) {
  if (run.status === "succeeded") {
    return `${run.importedAccounts} account${
      run.importedAccounts === 1 ? "" : "s"
    } checked, ${run.importedTransactions} new transaction${
      run.importedTransactions === 1 ? "" : "s"
    } imported.`;
  }

  if (run.status === "rate_limited") {
    return "The bank asked us to slow down. Try again later.";
  }

  return run.errorMessage ?? "The sync failed before it completed.";
}

export function useBankSyncRuns() {
  const router = useRouter();
  const notifiedRunIds = useRef(new Set<string>());
  const [runsByConnectionId, setRunsByConnectionId] = useState<
    Record<string, SyncRun>
  >({});

  const activeRuns = useMemo(
    () => Object.values(runsByConnectionId).filter(isActiveRun),
    [runsByConnectionId],
  );

  const pollRun = useCallback(
    async (connectionId: string, runId: string) => {
      const response = await fetch(
        `/api/integrations/enable-banking/${connectionId}/sync?runId=${runId}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        return null;
      }

      const body = (await response.json()) as { run: SyncRun | null };

      if (!body.run?.connectionId) {
        return null;
      }

      setRunsByConnectionId((current) => ({
        ...current,
        [body.run!.connectionId!]: body.run!,
      }));

      return body.run;
    },
    [],
  );

  const trackRunById = useCallback(
    async (connections: ConnectionRef[], runId: string) => {
      for (const connection of connections) {
        const run = await pollRun(connection.id, runId);

        if (run) {
          return run;
        }
      }

      return null;
    },
    [pollRun],
  );

  const queueSync = useCallback(async (connectionId: string) => {
    try {
      const response = await fetch(
        `/api/integrations/enable-banking/${connectionId}/sync`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as
        | { run?: SyncRun; error?: string }
        | null;

      if (!response.ok || !body?.run) {
        throw new Error(body?.error ?? "Could not queue sync");
      }

      setRunsByConnectionId((current) => ({
        ...current,
        [connectionId]: body.run!,
      }));
      toast.info("Bank sync queued", {
        description: "We will import accounts and transactions in the background.",
      });

      return body.run;
    } catch (error) {
      toast.error("Could not queue bank sync", {
        description:
          error instanceof Error ? error.message : "Please try again later.",
      });

      return null;
    }
  }, []);

  useEffect(() => {
    if (!activeRuns.length) {
      return;
    }

    const intervalId = window.setInterval(() => {
      for (const run of activeRuns) {
        if (run.connectionId) {
          void pollRun(run.connectionId, run.id);
        }
      }
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, [activeRuns, pollRun]);

  useEffect(() => {
    for (const run of Object.values(runsByConnectionId)) {
      if (isActiveRun(run) || notifiedRunIds.current.has(run.id)) {
        continue;
      }

      notifiedRunIds.current.add(run.id);

      if (run.status === "succeeded") {
        toast.success("Bank sync complete", {
          description: terminalMessage(run),
        });
        router.refresh();
      } else if (run.status === "rate_limited") {
        toast.warning("Bank sync rate limited", {
          description: terminalMessage(run),
        });
      } else if (run.status === "failed") {
        toast.error("Bank sync failed", {
          description: terminalMessage(run),
        });
      }
    }
  }, [router, runsByConnectionId]);

  return {
    getRunForConnection: (connectionId: string) => runsByConnectionId[connectionId],
    isConnectionSyncing: (connectionId: string) =>
      isActiveRun(runsByConnectionId[connectionId]),
    pollRun,
    queueSync,
    trackRunById,
  };
}

export function SyncRunStatus({ run }: { run: SyncRun | null | undefined }) {
  if (!run) {
    return null;
  }

  const isActive = isActiveRun(run);

  return (
    <div className="mt-3 rounded-2xl bg-secondary/50 p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-medium">
          {isActive ? <Loader2 className="size-4 animate-spin" /> : null}
          Sync {run.status.replace("_", " ")}
        </span>
        <Badge>{run.status}</Badge>
      </div>
      <p className="mt-2 text-muted-foreground">
        {isActive
          ? "Importing accounts and transactions in the background."
          : terminalMessage(run)}
      </p>
    </div>
  );
}
