"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { updateBillCategory } from "@/app/(app)/bills/actions";
import type { BillCategoryOption } from "@/components/recurring-bill-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { unwrapAction } from "@/lib/actions/client";
import { showErrorToast } from "@/lib/toast-errors";
import { cn } from "@/lib/utils";

const UNCATEGORIZED = "__uncategorized__";

type BillCategoryCellProps = {
  billId: string;
  categoryId: string | null;
  categoryName: string | null;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  isPending: boolean;
  categories: BillCategoryOption[];
  className?: string;
};

export function BillCategoryCell({
  billId,
  categoryId,
  categoryName,
  suggestedCategoryId,
  suggestedCategoryName,
  isPending,
  categories,
  className,
}: BillCategoryCellProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const hasSuggestion = isPending && suggestedCategoryId != null;
  const triggerLabel =
    categoryName ??
    (hasSuggestion
      ? `Suggested: ${suggestedCategoryName ?? "Unknown"}`
      : isPending
        ? "Uncategorized"
        : "—");

  async function saveCategoryPick(nextValue: string) {
    if (nextValue === UNCATEGORIZED) {
      return;
    }
    if (nextValue === categoryId) {
      return;
    }

    setSaving(true);
    try {
      const { applied } = await unwrapAction(
        updateBillCategory({
          billId,
          data: { categoryId: nextValue, applyToTransactions: true },
        }),
        "Could not update bill category",
      );
      toast.success(
        isPending && categoryId == null
          ? "Bill approved"
          : `Category updated${
              applied > 0
                ? ` and applied to ${applied} transaction${applied === 1 ? "" : "s"}`
                : ""
            }`,
      );
      router.refresh();
    } catch (error) {
      showErrorToast("Could not update bill category", error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select
      disabled={saving}
      value={categoryId ?? UNCATEGORIZED}
      onValueChange={(value) => void saveCategoryPick(value)}
    >
      <SelectTrigger
        id={`bill-category-inline-${billId}`}
        variant="inline"
        aria-label={`Category: ${triggerLabel}`}
        className={cn("w-full max-w-[12rem]", className)}
        title="Click to change category"
      >
        {saving ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
        ) : null}
        <span className="flex-1 truncate text-left text-sm">
          {triggerLabel}
        </span>
      </SelectTrigger>
      <SelectContent align="start">
        {categoryId == null ? (
          <SelectItem disabled value={UNCATEGORIZED}>
            Uncategorized
          </SelectItem>
        ) : null}
        {categories.map((category) => (
          <SelectItem key={category.id} value={category.id}>
            {category.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
