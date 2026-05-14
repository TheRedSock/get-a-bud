"use client";

import { Loader2, Play, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseApiResponse } from "@/lib/api-client";
import { showErrorToast } from "@/lib/toast-errors";

type ClassificationFilter =
  | "all"
  | "suggestions"
  | "needs-review"
  | "auto-labeled"
  | "user-labeled"
  | "uncategorized";

type TransferFilter = "all" | "linked" | "review" | "one-sided";

type ToolbarParams = {
  accountId?: string | null;
  classification?: ClassificationFilter;
  direction?: string;
  q?: string;
  sort?: string;
  transfer?: TransferFilter;
};

type Counts = {
  autoLabeled: number;
  linkedTransfers: number;
  needsReview: number;
  suggestions: number;
  transferReview: number;
  uncategorized: number;
};

export function TransactionsReviewToolbar({
  counts,
  params,
}: {
  counts: Counts;
  params: ToolbarParams;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);

  function hrefFor(overrides: Partial<ToolbarParams>) {
    const next = {
      ...params,
      ...overrides,
    };
    const query = new URLSearchParams();

    if (next.accountId) query.set("accountId", next.accountId);
    if (next.q) query.set("q", next.q);
    if (next.sort && next.sort !== "date") query.set("sort", next.sort);
    if (next.direction && next.direction !== "desc") {
      query.set("direction", next.direction);
    }
    if (next.classification && next.classification !== "all") {
      query.set("classification", next.classification);
    }
    if (next.transfer && next.transfer !== "all") {
      query.set("transfer", next.transfer);
    }

    return `/transactions${query.size ? `?${query}` : ""}`;
  }

  async function runClassification() {
    setRunning(true);

    try {
      const response = await fetch("/api/transactions/classify", {
        method: "POST",
      });
      await parseApiResponse(response);
      toast.success("Classification queued");
      router.refresh();
    } catch (error) {
      showErrorToast("Could not queue classification", error);
    } finally {
      setRunning(false);
    }
  }

  async function approveAllSuggestions() {
    setApprovingAll(true);

    try {
      const response = await fetch("/api/transactions/approve-all-suggestions", {
        method: "POST",
      });
      const body = await parseApiResponse<{ approved: number }>(response);
      toast.success(`Approved ${body.approved} suggestion${body.approved === 1 ? "" : "s"}`);
      router.refresh();
    } catch (error) {
      showErrorToast("Could not approve suggestions", error);
    } finally {
      setApprovingAll(false);
    }
  }

  const activeClassification = params.classification ?? "all";
  const activeTransfer = params.transfer ?? "all";

  return (
    <div className="grid gap-3">
      <form action="/transactions" className="relative">
        {params.accountId ? (
          <input name="accountId" type="hidden" value={params.accountId} />
        ) : null}
        {params.sort ? <input name="sort" type="hidden" value={params.sort} /> : null}
        {params.direction ? (
          <input name="direction" type="hidden" value={params.direction} />
        ) : null}
        {activeClassification !== "all" ? (
          <input
            name="classification"
            type="hidden"
            value={activeClassification}
          />
        ) : null}
        {activeTransfer !== "all" ? (
          <input name="transfer" type="hidden" value={activeTransfer} />
        ) : null}
        <Input
          className="pl-4"
          defaultValue={params.q ?? ""}
          name="q"
          placeholder="Search by merchant, note or category"
        />
      </form>

      <div className="flex flex-wrap gap-2">
        <FilterLink active={activeClassification === "all"} href={hrefFor({ classification: "all" })}>
          All
        </FilterLink>
        <FilterLink
          active={activeClassification === "suggestions"}
          href={hrefFor({ classification: "suggestions" })}
        >
          Suggestions ({counts.suggestions})
        </FilterLink>
        <FilterLink
          active={activeClassification === "needs-review"}
          href={hrefFor({ classification: "needs-review" })}
        >
          Needs review ({counts.needsReview})
        </FilterLink>
        <FilterLink
          active={activeClassification === "auto-labeled"}
          href={hrefFor({ classification: "auto-labeled" })}
        >
          Auto-labeled ({counts.autoLabeled})
        </FilterLink>
        <FilterLink
          active={activeClassification === "user-labeled"}
          href={hrefFor({ classification: "user-labeled" })}
        >
          User-labeled
        </FilterLink>
        <FilterLink
          active={activeClassification === "uncategorized"}
          href={hrefFor({ classification: "uncategorized" })}
        >
          Uncategorized ({counts.uncategorized})
        </FilterLink>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterLink active={activeTransfer === "all"} href={hrefFor({ transfer: "all" })}>
          All transfers
        </FilterLink>
        <FilterLink
          active={activeTransfer === "linked"}
          href={hrefFor({ transfer: "linked" })}
        >
          Linked ({counts.linkedTransfers})
        </FilterLink>
        <FilterLink
          active={activeTransfer === "review"}
          href={hrefFor({ transfer: "review" })}
        >
          Transfer review ({counts.transferReview})
        </FilterLink>
        <FilterLink
          active={activeTransfer === "one-sided"}
          href={hrefFor({ transfer: "one-sided" })}
        >
          One-sided
        </FilterLink>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={running}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => void runClassification()}
        >
          {running ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          Run classification
        </Button>
        <Button
          disabled={approvingAll || counts.suggestions === 0}
          size="sm"
          type="button"
          onClick={() => void approveAllSuggestions()}
        >
          {approvingAll ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Approve all suggestions
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Syncs queue classification automatically. Use Run classification after
        manual edits, imports or undone labels to refresh the review queue.
      </p>
    </div>
  );
}

function FilterLink({
  active,
  children,
  href,
}: {
  active: boolean;
  children: ReactNode;
  href: string;
}) {
  return (
    <Button asChild size="sm" variant={active ? "secondary" : "outline"}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}
