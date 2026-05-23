"use client";

import { Check, Loader2 } from "lucide-react";

import type { PipelinePhase, PipelineRunSummary } from "@/lib/ingestion/pipeline/types";
import { PIPELINE_PHASE_ORDER } from "@/lib/ingestion/pipeline/types";
import { cn } from "@/lib/utils";

const PHASE_LABELS: Record<PipelinePhase, string> = {
  sync: "Sync",
  categorize: "Classify",
  link: "Link",
  recurring: "Bills",
  done: "Done",
};

function phasesForKind(kind: PipelineRunSummary["kind"]): PipelinePhase[] {
  if (kind === "recurring_replay") {
    return ["recurring", "done"];
  }
  if (kind === "categorize") {
    return ["categorize", "done"];
  }
  return PIPELINE_PHASE_ORDER.filter((p) => p !== "done");
}

function phaseIndex(phases: PipelinePhase[], phase: PipelinePhase) {
  return phases.indexOf(phase);
}

export function PipelinePhaseStepper({ run }: { run: PipelineRunSummary }) {
  const phases = phasesForKind(run.kind);
  const currentIdx = phaseIndex(phases, run.currentPhase);

  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {phases.map((phase, index) => {
        const done =
          run.currentPhase === "done" ||
          (currentIdx >= 0 && index < currentIdx);
        const active = run.currentPhase === phase;
        const pending = currentIdx >= 0 && index > currentIdx && !done;

        return (
          <li key={phase} className="flex items-center gap-2">
            {index > 0 ? (
              <span className="text-muted-foreground" aria-hidden>
                →
              </span>
            ) : null}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium",
                done && "border-success/30 bg-success/10 text-success",
                active && "border-brand/40 bg-brand/10 text-brand",
                pending && "border-border text-muted-foreground",
                run.status === "failed" && active && "border-danger/40 bg-danger/10 text-danger",
              )}
            >
              {active && run.status !== "failed" ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
              ) : done ? (
                <Check className="size-3" aria-hidden />
              ) : null}
              {PHASE_LABELS[phase]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function pipelineCounterSummary(run: PipelineRunSummary) {
  const c = run.counters;
  const parts: string[] = [];

  if (c.importedTransactions) {
    parts.push(`${c.importedTransactions} imported`);
  }
  if (c.categorized) {
    parts.push(`${c.categorized} classified`);
  }
  if (c.linkedPairs) {
    parts.push(`${c.linkedPairs} linked`);
  }
  if (c.billsCreated) {
    parts.push(`${c.billsCreated} bills found`);
  }

  return parts.length ? parts.join(" · ") : "Starting…";
}
