"use client";

import { Link2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  getBillsForTransactionLink,
  getUnlinkedTransactionsForBill,
  linkTransactionToBill,
} from "@/app/(app)/bills/actions";
import { unwrapAction } from "@/lib/actions/client";
import { formatCents } from "@/lib/finance/money";
import { showErrorToast } from "@/lib/toast-errors";
import { cn } from "@/lib/utils";

type LoadState = "idle" | "loading" | "success" | "error";

type UnlinkedTransactionRow = {
  id: string;
  date: string;
  amountCents: number;
  currency: string;
  description: string | null;
  merchantName: string | null;
};

type BillLinkOption = {
  id: string;
  name: string;
  cadence: string;
  nextDueDate: string | null;
  expectedAmountCents: number | null;
  isActive: boolean;
};

const SEARCH_DEBOUNCE_MS = 300;

function TransactionCandidateButton({
  row,
  selected,
  onSelect,
}: {
  row: UnlinkedTransactionRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-xl border bg-background/60 p-3 text-left text-sm transition-colors",
        selected
          ? "border-primary ring-1 ring-primary"
          : "hover:bg-muted/50",
      )}
      onClick={onSelect}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {row.description ?? row.merchantName ?? "Transaction"}
          </p>
          <p className="text-xs text-muted-foreground">{row.date}</p>
        </div>
        <p className="font-semibold">
          {formatCents(row.amountCents, row.currency)}
        </p>
      </div>
    </button>
  );
}

function BillCandidateButton({
  row,
  selected,
  onSelect,
}: {
  row: BillLinkOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-xl border bg-background/60 p-3 text-left text-sm transition-colors",
        selected
          ? "border-primary ring-1 ring-primary"
          : "hover:bg-muted/50",
      )}
      onClick={onSelect}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{row.name}</p>
          <p className="text-xs text-muted-foreground">
            {row.cadence.replace(/_/g, " ")}
            {row.nextDueDate ? ` · next ${row.nextDueDate}` : ""}
            {!row.isActive ? " · ended" : ""}
          </p>
        </div>
        {row.expectedAmountCents != null ? (
          <p className="font-semibold">
            {formatCents(row.expectedAmountCents)}
          </p>
        ) : null}
      </div>
    </button>
  );
}

function renderTransactionList(
  label: string,
  items: UnlinkedTransactionRow[],
  selectedId: string | null,
  onSelect: (id: string) => void,
) {
  if (items.length === 0) return null;

  return (
    <div className="grid gap-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {items.map((row) => (
        <TransactionCandidateButton
          key={row.id}
          row={row}
          selected={selectedId === row.id}
          onSelect={() => onSelect(row.id)}
        />
      ))}
    </div>
  );
}

function renderBillList(
  label: string,
  items: BillLinkOption[],
  selectedBillId: string | null,
  onSelect: (id: string) => void,
) {
  if (items.length === 0) return null;

  return (
    <div className="grid gap-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {items.map((row) => (
        <BillCandidateButton
          key={row.id}
          row={row}
          selected={selectedBillId === row.id}
          onSelect={() => onSelect(row.id)}
        />
      ))}
    </div>
  );
}

/** Link an unlinked expense to this bill (from the bills page). */
export function LinkTransactionForBillDialog({
  billId,
  onLinked,
}: {
  billId: string;
  onLinked: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<UnlinkedTransactionRow[]>([]);
  const [others, setOthers] = useState<UnlinkedTransactionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCandidates = useCallback(async (query: string) => {
    setLoadState("loading");
    try {
      const body = await unwrapAction(
        getUnlinkedTransactionsForBill({
          billId,
          search: query.trim() || undefined,
        }),
        "Could not load transactions to link",
      );
      setSuggestions(body.suggestions);
      setOthers(body.others);
      setLoadState("success");
    } catch (error) {
      setLoadState("error");
      showErrorToast("Could not load transactions to link", error);
    }
  }, [billId]);

  function clearSearchDebounce() {
    if (searchDebounceRef.current != null) {
      window.clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (linking) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      clearSearchDebounce();
      setSelectedId(null);
      setSearch("");
      setLoadState("idle");
      return;
    }
    void loadCandidates("");
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    clearSearchDebounce();
    searchDebounceRef.current = window.setTimeout(() => {
      searchDebounceRef.current = null;
      void loadCandidates(value);
    }, SEARCH_DEBOUNCE_MS);
  }

  async function handleLink() {
    if (!selectedId) return;
    setLinking(true);
    try {
      await unwrapAction(
        linkTransactionToBill({ billId, transactionId: selectedId }),
        "Could not link transaction to bill",
      );
      toast.success("Transaction linked to bill");
      setOpen(false);
      setSelectedId(null);
      onLinked();
    } catch (error) {
      showErrorToast("Could not link transaction to bill", error);
    } finally {
      setLinking(false);
    }
  }

  const totalCandidates = suggestions.length + others.length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        size="sm"
        type="button"
        variant="outline"
        onClick={() => handleOpenChange(true)}
      >
        <Link2 className="size-4" aria-hidden />
        Link transaction
      </Button>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link transaction to bill</DialogTitle>
          <DialogDescription>
            Choose an expense to add to this bill&apos;s payment history. Search
            by description or merchant if nothing appears below.
          </DialogDescription>
        </DialogHeader>

        <Input
          aria-label="Search transactions"
          placeholder="Search description or merchant…"
          value={search}
          onChange={(event) => handleSearchChange(event.target.value)}
        />

        <div aria-live="polite" className="grid gap-3">
          {loadState === "loading" ? (
            <p className="text-sm text-muted-foreground">
              Loading transactions…
            </p>
          ) : loadState === "error" ? (
            <div className="grid gap-2">
              <p className="text-sm text-destructive" role="alert">
                Could not load transactions. Please try again.
              </p>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => void loadCandidates(search)}
              >
                Try again
              </Button>
            </div>
          ) : loadState === "success" && totalCandidates === 0 ? (
            <p className="text-sm text-muted-foreground">
              No unlinked expenses match. Try a broader search term.
            </p>
          ) : loadState === "success" ? (
            <>
              {renderTransactionList(
                "Suggested for this bill",
                suggestions,
                selectedId,
                setSelectedId,
              )}
              {renderTransactionList(
                "Other expenses",
                others,
                selectedId,
                setSelectedId,
              )}
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={linking}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selectedId || linking}
            onClick={() => void handleLink()}
          >
            {linking ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            Link selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Link this transaction to an existing bill (from the transactions list). */
export function LinkTransactionToBillDialog({
  transactionId,
  transactionLabel,
  onLinked,
}: {
  transactionId: string;
  transactionLabel: string;
  onLinked?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<BillLinkOption[]>([]);
  const [others, setOthers] = useState<BillLinkOption[]>([]);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCandidates = useCallback(async (query: string) => {
    setLoadState("loading");
    try {
      const body = await unwrapAction(
        getBillsForTransactionLink({
          transactionId,
          search: query.trim() || undefined,
        }),
        "Could not load bills",
      );
      setSuggestions(body.suggestions);
      setOthers(body.others);
      setLoadState("success");
    } catch (error) {
      setLoadState("error");
      showErrorToast("Could not load bills", error);
    }
  }, [transactionId]);

  function clearSearchDebounce() {
    if (searchDebounceRef.current != null) {
      window.clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (linking) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      clearSearchDebounce();
      setSelectedBillId(null);
      setSearch("");
      setLoadState("idle");
      return;
    }
    void loadCandidates("");
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    clearSearchDebounce();
    searchDebounceRef.current = window.setTimeout(() => {
      searchDebounceRef.current = null;
      void loadCandidates(value);
    }, SEARCH_DEBOUNCE_MS);
  }

  async function handleLink() {
    if (!selectedBillId) return;
    setLinking(true);
    try {
      await unwrapAction(
        linkTransactionToBill({
          billId: selectedBillId,
          transactionId,
        }),
        "Could not link transaction to bill",
      );
      toast.success("Transaction linked to bill");
      setOpen(false);
      setSelectedBillId(null);
      onLinked?.();
      router.refresh();
    } catch (error) {
      showErrorToast("Could not link transaction to bill", error);
    } finally {
      setLinking(false);
    }
  }

  const totalCandidates = suggestions.length + others.length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        aria-label="Link to recurring bill"
        className="size-8 shrink-0 p-0"
        size="sm"
        title="Link to recurring bill"
        type="button"
        variant="outline"
        onClick={() => handleOpenChange(true)}
      >
        <Link2 className="size-4" aria-hidden />
        <span className="sr-only">Link to recurring bill</span>
      </Button>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link to recurring bill</DialogTitle>
          <DialogDescription>
            Add &ldquo;{transactionLabel}&rdquo; to a bill&apos;s payment history.
          </DialogDescription>
        </DialogHeader>

        <Input
          aria-label="Search bills"
          placeholder="Search bill name…"
          value={search}
          onChange={(event) => handleSearchChange(event.target.value)}
        />

        <div aria-live="polite" className="grid gap-3">
          {loadState === "loading" ? (
            <p className="text-sm text-muted-foreground">Loading bills…</p>
          ) : loadState === "error" ? (
            <div className="grid gap-2">
              <p className="text-sm text-destructive" role="alert">
                Could not load bills. Please try again.
              </p>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => void loadCandidates(search)}
              >
                Try again
              </Button>
            </div>
          ) : loadState === "success" && totalCandidates === 0 ? (
            <p className="text-sm text-muted-foreground">
              No bills match. Try another search or create the bill on the Bills
              page first.
            </p>
          ) : loadState === "success" ? (
            <>
              {renderBillList(
                "Suggested bills",
                suggestions,
                selectedBillId,
                setSelectedBillId,
              )}
              {renderBillList(
                "Other bills",
                others,
                selectedBillId,
                setSelectedBillId,
              )}
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={linking}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selectedBillId || linking}
            onClick={() => void handleLink()}
          >
            {linking ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            Link to bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
