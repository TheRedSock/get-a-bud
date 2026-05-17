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
import { parseApiResponse } from "@/lib/api-client";
import { showErrorToast } from "@/lib/toast-errors";
import { queueEnableBankingSync } from "@/app/(app)/settings/integrations/actions";
import { unwrapAction } from "@/lib/actions/client";

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
  progress: {
    importedAccounts?: number;
    importedTransactions?: number;
    pagesFetched?: number;
    currentAccountId?: string;
    currentAccountName?: string;
    rateLimitedUntil?: string;
  } | null;
};

type ConnectionRef = {
  id: string;
};

function isActiveRun(run: SyncRun | null | undefined) {
  return run?.status === "queued" || run?.status === "running";
}

function isBlockedRun(run: SyncRun | null | undefined) {
  return run?.status === "rate_limited";
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
    const retryAt = run.progress?.rateLimitedUntil
      ? new Date(run.progress.rateLimitedUntil).toLocaleString()
      : "later";

    return `The bank asked us to slow down. Sync will resume ${retryAt}.`;
  }

  return run.errorMessage ?? "The sync failed before it completed.";
}

function progressMessage(run: SyncRun) {
  const accounts = run.progress?.importedAccounts ?? run.importedAccounts;
  const transactions =
    run.progress?.importedTransactions ?? run.importedTransactions;
  const pages = run.progress?.pagesFetched ?? 0;
  const currentAccount = run.progress?.currentAccountName;
  const prefix =
    run.status === "rate_limited"
      ? "Paused by bank rate limiting."
      : "Importing accounts and transactions.";

  return `${prefix} ${accounts} account${accounts === 1 ? "" : "s"} checked, ${transactions} new transaction${transactions === 1 ? "" : "s"} imported, ${pages} page${pages === 1 ? "" : "s"} fetched${
    currentAccount ? `, currently on ${currentAccount}` : ""
  }.`;
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
  const blockedRuns = useMemo(
    () => Object.values(runsByConnectionId).filter(isBlockedRun),
    [runsByConnectionId],
  );

  const pollRun = useCallback(
    async (connectionId: string, runId: string) => {
      try {
        const response = await fetch(
          `/api/integrations/enable-banking/${connectionId}/sync?runId=${runId}`,
          { cache: "no-store" },
        );

        const body = await parseApiResponse<{ run: SyncRun | null }>(response);

        if (!body.run?.connectionId) {
          return null;
        }

        setRunsByConnectionId((current) => ({
          ...current,
          [body.run!.connectionId!]: body.run!,
        }));

        return body.run;
      } catch {
        return null;
      }
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
      const { run } = await unwrapAction(
        queueEnableBankingSync({ connectionId }),
        "Could not queue bank sync",
      );

      setRunsByConnectionId((current) => ({
        ...current,
        [connectionId]: {
          id: run.id,
          connectionId,
          status: run.status,
          startedAt: null,
          finishedAt: null,
          importedAccounts: 0,
          importedTransactions: 0,
          errorCode: null,
          errorMessage: null,
          progress: null,
        },
      }));
      toast.info("Bank sync queued", {
        description: "We will import accounts and transactions in the background.",
      });

      return { id: run.id, connectionId, status: run.status } as SyncRun;
    } catch (error) {
      showErrorToast("Could not queue bank sync", error, "Please try again later.");

      return null;
    }
  }, []);

  const loadLatestRuns = useCallback(
    async (connections: ConnectionRef[]) => {
      const loadedRuns = await Promise.all(
        connections.map(async (connection) => {
          try {
            const response = await fetch(
              `/api/integrations/enable-banking/${connection.id}/sync`,
              { cache: "no-store" },
            );
            const body = await parseApiResponse<{ run: SyncRun | null }>(response);

            return body.run;
          } catch {
            return null;
          }
        }),
      );

      setRunsByConnectionId((current) => {
        const next = { ...current };

        for (const run of loadedRuns) {
          if (run?.connectionId && (isActiveRun(run) || isBlockedRun(run))) {
            next[run.connectionId] = run;
          }
        }

        return next;
      });
    },
    [],
  );

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
    if (!blockedRuns.length) {
      return;
    }

    const intervalId = window.setInterval(() => {
      for (const run of blockedRuns) {
        if (run.connectionId) {
          void pollRun(run.connectionId, run.id);
        }
      }
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [blockedRuns, pollRun]);

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
      isActiveRun(runsByConnectionId[connectionId]) ||
      isBlockedRun(runsByConnectionId[connectionId]),
    loadLatestRuns,
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
  const isBlocked = isBlockedRun(run);

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
        {isActive || isBlocked ? progressMessage(run) : terminalMessage(run)}
      </p>
    </div>
  );
}
