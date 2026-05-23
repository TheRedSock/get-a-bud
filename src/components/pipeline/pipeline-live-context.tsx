"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { PipelineRunSummary } from "@/lib/ingestion/pipeline/types";
import { isActivePipelineStatus } from "@/lib/ingestion/pipeline/types";

export type PipelineLiveMode = "live" | "paused";

type PipelineLiveContextValue = {
  runs: PipelineRunSummary[];
  hasActiveRuns: boolean;
  liveMode: PipelineLiveMode;
  setLiveMode: (mode: PipelineLiveMode) => void;
  dismissRun: (runId: string) => void;
  frozenRowIds: Set<string>;
  registerFrozenRow: (id: string) => void;
  unregisterFrozenRow: (id: string) => void;
  offPageNewCount: number;
  setOffPageNewCount: (count: number) => void;
  overflowMessage: string | null;
  setOverflowMessage: (message: string | null) => void;
  refreshRuns: () => Promise<void>;
  trackPipelineRunId: (runId: string) => void;
};

const PipelineLiveContext = createContext<PipelineLiveContextValue | null>(null);

const LIVE_MODE_KEY = "pipeline-live-mode";

function readStoredLiveMode(): PipelineLiveMode {
  if (typeof window === "undefined") return "live";
  return window.localStorage.getItem(LIVE_MODE_KEY) === "paused" ? "paused" : "live";
}

export function PipelineLiveProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [runs, setRuns] = useState<PipelineRunSummary[]>([]);
  const [liveMode, setLiveModeState] = useState<PipelineLiveMode>(() =>
    readStoredLiveMode(),
  );
  const [dismissedRunIds, setDismissedRunIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [frozenRowIds, setFrozenRowIds] = useState<Set<string>>(() => new Set());
  const [offPageNewCount, setOffPageNewCount] = useState(0);
  const [overflowMessage, setOverflowMessage] = useState<string | null>(null);
  const frozenRef = useRef<Map<string, number>>(new Map());
  const notifiedTerminal = useRef<Set<string>>(new Set());

  const setLiveMode = useCallback((mode: PipelineLiveMode) => {
    setLiveModeState(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LIVE_MODE_KEY, mode);
    }
  }, []);

  const previousActiveIds = useRef<Set<string>>(new Set());

  const refreshRuns = useCallback(async () => {
    try {
      const response = await fetch("/api/pipeline/active", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { runs?: PipelineRunSummary[] };
      const nextRuns = body.runs ?? [];
      setRuns(nextRuns);

      // Detect runs that were previously active but are no longer in the
      // active list — they've reached a terminal state.
      const currentActiveIds = new Set(nextRuns.map((r) => r.id));
      for (const prevId of previousActiveIds.current) {
        if (currentActiveIds.has(prevId)) continue;
        if (notifiedTerminal.current.has(prevId)) continue;
        notifiedTerminal.current.add(prevId);

        // Fetch final status to determine success vs failure
        try {
          const detail = await fetch(`/api/pipeline/${prevId}`, {
            cache: "no-store",
          });
          if (detail.ok) {
            const { run } = (await detail.json()) as {
              run?: PipelineRunSummary;
            };
            if (run?.status === "failed") {
              toast.error(
                run.errorMessage ?? "Background processing failed.",
              );
            } else {
              toast.success("Background processing finished.", {
                description:
                  "Your accounts and transactions are up to date.",
              });
              router.refresh();
            }
          } else {
            // Can't determine status — assume success, refresh data
            toast.success("Background processing finished.");
            router.refresh();
          }
        } catch {
          // Network error fetching detail — refresh anyway
          router.refresh();
        }
      }

      previousActiveIds.current = currentActiveIds;
    } catch {
      // ignore transient poll failures
    }
  }, [router]);

  const trackPipelineRunId = useCallback(
    (_runId: string) => {
      void refreshRuns();
    },
    [refreshRuns],
  );

  const dismissRun = useCallback((runId: string) => {
    setDismissedRunIds((prev) => new Set(prev).add(runId));
  }, []);

  const registerFrozenRow = useCallback((id: string) => {
    const count = frozenRef.current.get(id) ?? 0;
    frozenRef.current.set(id, count + 1);
    setFrozenRowIds(new Set(frozenRef.current.keys()));
  }, []);

  const unregisterFrozenRow = useCallback((id: string) => {
    const count = frozenRef.current.get(id) ?? 0;
    if (count <= 1) {
      frozenRef.current.delete(id);
    } else {
      frozenRef.current.set(id, count - 1);
    }
    setFrozenRowIds(new Set(frozenRef.current.keys()));
  }, []);

  const visibleRuns = useMemo(
    () => runs.filter((r) => !dismissedRunIds.has(r.id)),
    [runs, dismissedRunIds],
  );

  const hasActiveRuns = useMemo(
    () => visibleRuns.some((r) => isActivePipelineStatus(r.status)),
    [visibleRuns],
  );

  useEffect(() => {
    const intervalMs = hasActiveRuns ? 2000 : 30_000;
    const tick = () => {
      void refreshRuns();
    };
    const initial = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, intervalMs);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(id);
    };
  }, [refreshRuns, hasActiveRuns]);

  const value = useMemo(
    () => ({
      runs: visibleRuns,
      hasActiveRuns,
      liveMode,
      setLiveMode,
      dismissRun,
      frozenRowIds,
      registerFrozenRow,
      unregisterFrozenRow,
      offPageNewCount,
      setOffPageNewCount,
      overflowMessage,
      setOverflowMessage,
      refreshRuns,
      trackPipelineRunId,
    }),
    [
      visibleRuns,
      hasActiveRuns,
      liveMode,
      setLiveMode,
      dismissRun,
      frozenRowIds,
      registerFrozenRow,
      unregisterFrozenRow,
      offPageNewCount,
      overflowMessage,
      refreshRuns,
      trackPipelineRunId,
    ],
  );

  return (
    <PipelineLiveContext.Provider value={value}>
      {children}
    </PipelineLiveContext.Provider>
  );
}

export function usePipelineLive() {
  const ctx = useContext(PipelineLiveContext);
  if (!ctx) {
    throw new Error("usePipelineLive must be used within PipelineLiveProvider");
  }
  return ctx;
}

export function usePipelineLiveOptional() {
  return useContext(PipelineLiveContext);
}
