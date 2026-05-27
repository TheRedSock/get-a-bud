"use client";

import {
  Eye,
  Link2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Tag,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { LinkTransactionForBillDialog } from "@/components/bills/bill-linking-dialogs";
import {
  BillTransactionsViewer,
  RecurringBillEditor,
} from "@/components/recurring-bill-actions";
import { DestructiveConfirmDialog } from "@/components/feedback/destructive-confirm-dialog";
import type { BillCategoryOption } from "@/components/recurring-bill-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogScrollBody,
  DialogTitle,
  dialogScrollableShellClass,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  rejectBill,
  resolveDefaultBillCategoryId,
  updateBill,
  updateBillCategory,
} from "@/app/(app)/bills/actions";
import { unwrapAction } from "@/lib/actions/client";
import { billNeedsApproval } from "@/lib/finance/bills/approval";
import { DEFAULT_BILL_CATEGORY_NAME } from "@/lib/finance/bills/constants";
import { showErrorToast } from "@/lib/toast-errors";

type BillRowActionsProps = {
  bill: {
    id: string;
    name: string;
    cadence: string;
    isActive: boolean;
    isPossiblyCancelled: boolean;
    categoryId: string | null;
    userEndedAt: Date | null;
    suggestedCategoryId: string | null;
    expectedAmount: string | null;
    nextDueDate: string | null;
  };
  categories: BillCategoryOption[];
};

export function BillRowActions({ bill, categories }: BillRowActionsProps) {
  const router = useRouter();
  const isPending = billNeedsApproval(bill);

  const [approveOpen, setApproveOpen] = useState(false);
  const [changeCategoryOpen, setChangeCategoryOpen] = useState(false);
  const [endBillOpen, setEndBillOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [matchesOpen, setMatchesOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Actions for ${bill.name}`}
            size="icon"
            type="button"
            variant="outline"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isPending ? (
            <>
              <DropdownMenuItem onSelect={() => setApproveOpen(true)}>
                <ThumbsUp className="size-4" />
                Approve bill
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setRejectOpen(true)}
              >
                <ThumbsDown className="size-4" />
                Reject bill
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : bill.isActive ? (
            <>
              <DropdownMenuItem onSelect={() => setChangeCategoryOpen(true)}>
                <Tag className="size-4" />
                Change category
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEndBillOpen(true)}>
                End bill
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Edit details
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setMatchesOpen(true)}>
            <Eye className="size-4" />
            Show matches
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setLinkOpen(true)}>
            <Link2 className="size-4" />
            Link transaction
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <LinkTransactionForBillDialog
        billId={bill.id}
        hideTrigger
        open={linkOpen}
        onLinked={() => router.refresh()}
        onOpenChange={setLinkOpen}
      />

      {isPending ? (
        <ApproveBillDialog
          billId={bill.id}
          categories={categories}
          open={approveOpen}
          suggestedCategoryId={bill.suggestedCategoryId}
          onOpenChange={setApproveOpen}
        />
      ) : null}

      {!isPending && bill.isActive ? (
        <ChangeCategoryDialog
          billId={bill.id}
          categories={categories}
          initialCategoryId={bill.categoryId}
          open={changeCategoryOpen}
          onOpenChange={setChangeCategoryOpen}
        />
      ) : null}

      <EndBillDialog
        billId={bill.id}
        open={endBillOpen}
        onOpenChange={setEndBillOpen}
      />

      <RejectBillDialog
        billId={bill.id}
        open={rejectOpen}
        onOpenChange={setRejectOpen}
      />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className={dialogScrollableShellClass}>
          <DialogHeader>
            <DialogTitle>Edit bill</DialogTitle>
            <DialogDescription>Update schedule, category, and amounts.</DialogDescription>
          </DialogHeader>
          <DialogScrollBody>
            <RecurringBillEditor
              billId={bill.id}
              cadence={bill.cadence}
              categories={categories}
              categoryId={bill.categoryId}
              embedded
              expectedAmount={bill.expectedAmount}
              isActive={bill.isActive}
              isPossiblyCancelled={bill.isPossiblyCancelled}
              name={bill.name}
              nextDueDate={bill.nextDueDate}
              showEndToggle={false}
              suggestedCategoryId={bill.suggestedCategoryId}
              onSaved={() => {
                setEditOpen(false);
                router.refresh();
              }}
            />
          </DialogScrollBody>
        </DialogContent>
      </Dialog>

      <Dialog
        open={matchesOpen}
        onOpenChange={(next) => {
          setMatchesOpen(next);
        }}
      >
        <DialogContent className={dialogScrollableShellClass}>
          <DialogHeader>
            <DialogTitle>Matching transactions</DialogTitle>
            <DialogDescription>
              Payments linked to this recurring bill from your transaction
              history.
            </DialogDescription>
          </DialogHeader>
          <DialogScrollBody>
            {matchesOpen ? (
              <BillTransactionsViewer
                billId={bill.id}
                embedded
                loadOnMount
                onLinked={() => router.refresh()}
              />
            ) : null}
          </DialogScrollBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ApproveBillDialog({
  billId,
  categories,
  open,
  onOpenChange,
  suggestedCategoryId,
}: {
  billId: string;
  categories: BillCategoryOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestedCategoryId: string | null;
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(suggestedCategoryId ?? "");
  const [saving, setSaving] = useState(false);

  function handleOpenChange(next: boolean) {
    if (next) {
      setCategoryId(suggestedCategoryId ?? "");
    }
    onOpenChange(next);
  }

  async function approveWithCategory(selectedId: string) {
    setSaving(true);
    try {
      await unwrapAction(
        updateBillCategory({
          billId,
          data: { categoryId: selectedId, applyToTransactions: true },
        }),
        "Could not approve bill",
      );
      toast.success("Bill approved");
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      showErrorToast("Could not approve bill", error);
    } finally {
      setSaving(false);
    }
  }

  async function approveWithDefault() {
    setSaving(true);
    try {
      const { categoryId: defaultId } = await unwrapAction(
        resolveDefaultBillCategoryId({}),
        "Could not resolve default category",
      );
      await approveWithCategory(defaultId);
    } catch (error) {
      showErrorToast("Could not approve bill", error);
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve bill</DialogTitle>
          <DialogDescription>
            Choose a category to track this recurring bill. Matched transactions
            can be updated too.
          </DialogDescription>
        </DialogHeader>
        <Select value={categoryId || undefined} onValueChange={setCategoryId}>
          <SelectTrigger aria-label="Bill category">
            <SelectValue placeholder="Choose category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            disabled={saving || !categoryId}
            type="button"
            onClick={() => void approveWithCategory(categoryId)}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <ThumbsUp className="size-4" aria-hidden />
            )}
            Approve & apply to matches
          </Button>
          <Button
            disabled={saving}
            type="button"
            variant="secondary"
            onClick={() => void approveWithDefault()}
          >
            Quick approve ({DEFAULT_BILL_CATEGORY_NAME})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangeCategoryDialog({
  billId,
  categories,
  initialCategoryId,
  open,
  onOpenChange,
}: {
  billId: string;
  categories: BillCategoryOption[];
  initialCategoryId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(initialCategoryId ?? "");
  const [saving, setSaving] = useState(false);

  function handleOpenChange(next: boolean) {
    if (next && initialCategoryId) {
      setCategoryId(initialCategoryId);
    }
    onOpenChange(next);
  }

  async function save() {
    if (!categoryId) {
      toast.error("Choose a category — clearing is not allowed for active bills.");
      return;
    }
    setSaving(true);
    try {
      const { applied } = await unwrapAction(
        updateBillCategory({
          billId,
          data: { categoryId, applyToTransactions: true },
        }),
        "Could not update bill category",
      );
      toast.success(
        `Category updated${
          applied > 0
            ? ` and applied to ${applied} transaction${applied === 1 ? "" : "s"}`
            : ""
        }`,
      );
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      showErrorToast("Could not update bill category", error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change category</DialogTitle>
          <DialogDescription>
            Update how this bill is categorized. Active bills must keep a
            category.
          </DialogDescription>
        </DialogHeader>
        <Select value={categoryId || undefined} onValueChange={setCategoryId}>
          <SelectTrigger aria-label="Bill category">
            <SelectValue placeholder="Choose category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button
            disabled={saving || !categoryId}
            type="button"
            onClick={() => void save()}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            Save category
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EndBillDialog({
  billId,
  open,
  onOpenChange,
}: {
  billId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function endBill() {
    setEnding(true);
    setError(null);
    try {
      await unwrapAction(
        updateBill({ billId, data: { isActive: false } }),
        "Could not end bill",
      );
      toast.success("Bill ended");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError("We could not end this bill. Please try again.");
      showErrorToast("Could not end bill", err);
    } finally {
      setEnding(false);
    }
  }

  return (
    <DestructiveConfirmDialog
      confirmLabel="End bill"
      description="End this recurring bill? You can reactivate it later from edit details if needed."
      errorMessage={error}
      open={open}
      pending={ending}
      title="End this bill?"
      onConfirm={endBill}
      onOpenChange={onOpenChange}
    />
  );
}

function RejectBillDialog({
  billId,
  open,
  onOpenChange,
}: {
  billId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReject() {
    setRejecting(true);
    setError(null);
    try {
      const result = await rejectBill({ billId });
      if (result.error) {
        setError("We could not reject this bill. Please try again.");
        return;
      }
      toast.success("Bill rejected");
      onOpenChange(false);
      router.refresh();
    } catch {
      setError("We could not reject this bill. Please try again.");
    } finally {
      setRejecting(false);
    }
  }

  return (
    <DestructiveConfirmDialog
      confirmLabel="Reject bill"
      description="Reject this recurring bill? It will be removed and matched transactions will be ignored by future detection."
      errorMessage={error}
      open={open}
      pending={rejecting}
      title="Reject recurring bill?"
      onConfirm={handleReject}
      onOpenChange={onOpenChange}
    />
  );
}
