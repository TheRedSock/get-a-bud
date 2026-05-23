"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { TransactionEditor } from "@/components/transaction-editor";
import { usePipelineLive } from "@/components/pipeline/pipeline-live-context";
import { Button } from "@/components/ui/button";
import {
  inferPipelineRowChange,
  type PipelineRowChangeKind,
} from "@/lib/ingestion/pipeline/infer-row-change";
import { parseApiResponse } from "@/lib/api-client";
import type {
  AccountOption,
  CategoryOption,
  TransactionListFilters,
} from "@/lib/finance/transactions";
import { cn } from "@/lib/utils";

type EnrichedRow = Awaited<
  ReturnType<
    typeof import("@/lib/finance/transactions").enrichTransactionRows
  >
>[number] & { recurringBillId?: string | null };

type TransactionsLiveSectionProps = {
  initialRows: EnrichedRow[];
  filters: TransactionListFilters;
  options: { categories: CategoryOption[]; accounts: AccountOption[] };
  hasNextPage: boolean;
  hrefFor: (
    overrides: Partial<TransactionListFilters> & { page?: number },
  ) => string;
  tableHeader: ReactNode;
};

const HIGHLIGHT_MS = 6000;

export function TransactionsLiveSection({
  initialRows,
  filters,
  options,
  hasNextPage,
  hrefFor,
  tableHeader,
}: TransactionsLiveSectionProps) {
  const {
    runs,
    hasActiveRuns,
    liveMode,
    frozenRowIds,
    setOffPageNewCount,
    setOverflowMessage,
  } = usePipelineLive();

  const [rows, setRows] = useState(initialRows);
  const [highlights, setHighlights] = useState<
    Record<string, PipelineRowChangeKind>
  >({});

  // Initialize cursor from the latest updatedAt in SSR data so the first
  // poll only returns changes that happened AFTER the page was rendered.
  const initialCursor = useMemo<{ at: string; id: string } | null>(() => {
    if (initialRows.length === 0) return null;
    let latest = initialRows[0]!;
    for (const row of initialRows) {
      if (
        "updatedAt" in row &&
        row.updatedAt instanceof Date &&
        "updatedAt" in latest &&
        latest.updatedAt instanceof Date &&
        row.updatedAt > latest.updatedAt
      ) {
        latest = row;
      }
    }
    const updatedAt =
      "updatedAt" in latest && latest.updatedAt instanceof Date
        ? latest.updatedAt
        : new Date();
    return { at: updatedAt.toISOString(), id: latest.id };
  }, [initialRows]);

  const cursorRef = useRef(initialCursor);
  const rowsByIdRef = useRef(new Map<string, EnrichedRow>());

  const primaryRun = runs.find((r) => r.kind === "full_post_sync") ?? runs[0];

  useEffect(() => {
    rowsByIdRef.current = new Map(initialRows.map((r) => [r.id, r]));
  }, [initialRows]);

  const mergeRow = useCallback(
    (prev: EnrichedRow | undefined, next: EnrichedRow) => {
      const kind = inferPipelineRowChange(
        prev
          ? {
              id: prev.id,
              categoryId: prev.categoryId,
              suggestedCategoryId: prev.suggestedCategoryId,
              transferGroupId: prev.transferGroupId,
              transferSummary: prev.transferSummary,
              recurringBillId: prev.recurringBill?.billName ? prev.id : null,
            }
          : undefined,
        {
          id: next.id,
          categoryId: next.categoryId,
          suggestedCategoryId: next.suggestedCategoryId,
          transferGroupId: next.transferGroupId,
          transferSummary: next.transferSummary,
          recurringBillId: next.recurringBill ? next.id : null,
        },
      );

      if (kind) {
        setHighlights((current) => ({ ...current, [next.id]: kind }));
        window.setTimeout(() => {
          setHighlights((current) => {
            const copy = { ...current };
            delete copy[next.id];
            return copy;
          });
        }, HIGHLIGHT_MS);
      }

      return next;
    },
    [],
  );

  useEffect(() => {
    if (!primaryRun || !hasActiveRuns || liveMode !== "live") {
      return;
    }

    let cancelled = false;

    async function poll() {
      const params = new URLSearchParams();
      if (cursorRef.current) {
        params.set("since", cursorRef.current.at);
        params.set("sinceId", cursorRef.current.id);
      }
      if (filters.accountId) {
        params.set("accountId", filters.accountId);
      }

      try {
        const response = await fetch(
          `/api/pipeline/${primaryRun.id}/changes?${params.toString()}`,
          { cache: "no-store" },
        );
        const body = await parseApiResponse<{
          transactions: EnrichedRow[];
          nextCursor: { at: string; id: string } | null;
          overflow: boolean;
        }>(response);

        if (cancelled) return;

        if (body.overflow) {
          setOverflowMessage(
            "Many changes — refresh the page to catch up with the latest data.",
          );
          return;
        }

        setOverflowMessage(null);

        if (body.nextCursor) {
          cursorRef.current = body.nextCursor;
        }

        let offPage = 0;

        setRows((current) => {
          const map = new Map(current.map((r) => [r.id, r]));
          let nextList = [...current];

          for (const deltaRow of body.transactions) {
            if (frozenRowIds.has(deltaRow.id)) {
              continue;
            }

            const prev = rowsByIdRef.current.get(deltaRow.id);
            const merged = mergeRow(prev, deltaRow);
            rowsByIdRef.current.set(deltaRow.id, merged);

            if (map.has(deltaRow.id)) {
              nextList = nextList.map((r) => (r.id === deltaRow.id ? merged : r));
            } else if (filters.page > 1) {
              offPage += 1;
            } else {
              nextList = [merged, ...nextList].slice(0, current.length || 50);
            }
          }

          return nextList;
        });

        setOffPageNewCount(offPage);
      } catch {
        // ignore poll errors
      }
    }

    void poll();
    const id = window.setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    primaryRun,
    hasActiveRuns,
    liveMode,
    frozenRowIds,
    filters.page,
    filters.accountId,
    mergeRow,
    setOffPageNewCount,
    setOverflowMessage,
  ]);

  const rowHighlightClass = useMemo(
    () =>
      ({
        imported: "bg-brand/10 ring-1 ring-brand/30",
        categorized: "bg-success/10 ring-1 ring-success/30",
        linked: "bg-secondary ring-1 ring-border",
        bill: "bg-brand/5 ring-1 ring-brand/20",
      }) satisfies Record<PipelineRowChangeKind, string>,
    [],
  );

  return (
    <>
      {rows.length ? (
        <>
          <div
            className={cn(
              "overflow-x-auto rounded-3xl border bg-background/40 transition-colors",
              hasActiveRuns && liveMode === "live" && "border-brand/30",
            )}
          >
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
                {tableHeader}
              </thead>
              <tbody>
                {rows.map((transaction) => (
                  <TransactionEditor
                    key={transaction.id}
                    categories={options.categories}
                    transaction={transaction}
                    rowClassName={
                      highlights[transaction.id]
                        ? rowHighlightClass[highlights[transaction.id]!]
                        : undefined
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Page {filters.page}, showing up to {rows.length} transactions.
              {hasActiveRuns && liveMode === "live" && filters.page > 1
                ? " Live updates apply to this page only."
                : null}
            </p>
            <div className="flex gap-2">
              {filters.page === 1 ? (
                <Button disabled size="sm" variant="outline">
                  Previous
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link href={hrefFor({ page: filters.page - 1 })}>Previous</Link>
                </Button>
              )}
              {hasNextPage ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={hrefFor({ page: filters.page + 1 })}>Next page</Link>
                </Button>
              ) : (
                <Button disabled size="sm" variant="outline">
                  Next page
                </Button>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-3xl border border-dashed bg-background/40 p-8 text-center">
          <p className="font-semibold">No transactions yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {hasActiveRuns
              ? "Waiting for transactions to appear from sync…"
              : "Sync a connected bank or add a manual transaction once an account exists."}
          </p>
        </div>
      )}
    </>
  );
}
