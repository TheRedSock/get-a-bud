"use client";

import { Loader2, Play, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseApiResponse } from "@/lib/api-client";
import { showErrorToast } from "@/lib/toast-errors";

const NO_CATEGORY = "__none";

export type BillCategoryOption = {
  id: string;
  name: string;
};

export function RunRecurringDetectionButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function runDetection() {
    setLoading(true);

    try {
      const response = await fetch("/api/bills/detect", { method: "POST" });
      await parseApiResponse(response);
      toast.success("Recurring detection queued");
      router.refresh();
    } catch (error) {
      showErrorToast("Could not queue recurring detection", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      disabled={loading}
      type="button"
      variant="outline"
      onClick={() => void runDetection()}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Play className="size-4" />
      )}
      Run recurring detection
    </Button>
  );
}

export function RecurringBillCategoryAction({
  billId,
  categories,
  initialCategoryId,
}: {
  billId: string;
  categories: BillCategoryOption[];
  initialCategoryId: string | null;
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(initialCategoryId ?? NO_CATEGORY);
  const [saving, setSaving] = useState(false);

  async function saveCategory() {
    setSaving(true);

    try {
      const response = await fetch(`/api/bills/${billId}/category`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: categoryId === NO_CATEGORY ? null : categoryId,
          applyToTransactions: true,
        }),
      });
      const body = await parseApiResponse<{ applied: number }>(response);
      toast.success(
        `Bill category saved${
          body.applied > 0
            ? ` and applied to ${body.applied} transaction${body.applied === 1 ? "" : "s"}`
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
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Select value={categoryId} onValueChange={setCategoryId}>
        <SelectTrigger className="h-9 min-w-44">
          <SelectValue placeholder="Choose category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_CATEGORY}>No category</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        disabled={saving || categoryId === NO_CATEGORY}
        size="sm"
        type="button"
        variant="outline"
        onClick={() => void saveCategory()}
      >
        {saving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Save className="size-4" />
        )}
        Apply to matches
      </Button>
    </div>
  );
}
