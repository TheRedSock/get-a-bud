"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { createTransaction } from "@/app/(app)/transactions/actions";
import { LiveRegion } from "@/components/feedback/live-region";
import { FormField, formFieldDescribedBy } from "@/components/forms/form-field";
import { FormSelectField } from "@/components/forms/form-select";
import { MoneyField } from "@/components/forms/money-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrapAction } from "@/lib/actions/client";
import { createTransactionFormSchema } from "@/lib/finance/validation";
import { showErrorToast } from "@/lib/toast-errors";
import { cn } from "@/lib/utils";

type CreateTransactionFormProps = {
  accounts: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
};

type CreateTransactionFormValues = z.input<typeof createTransactionFormSchema>;

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function CreateTransactionForm({
  accounts,
  categories,
}: CreateTransactionFormProps) {
  const router = useRouter();
  const [announcement, setAnnouncement] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateTransactionFormValues>({
    resolver: zodResolver(createTransactionFormSchema),
    mode: "onBlur",
    defaultValues: {
      description: "",
      amountCents: "",
      accountId: accounts[0]?.id ?? "",
      currency: "NOK",
      date: todayString(),
      merchantName: "",
      categoryId: "",
      notes: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const trimmedMerchant = values.merchantName?.trim();
      const trimmedNotes = values.notes?.trim();
      const payload = {
        ...values,
        merchantName: trimmedMerchant || undefined,
        notes: trimmedNotes || undefined,
      };

      await unwrapAction(
        createTransaction(payload),
        "Could not create transaction",
      );
      const successMessage = payload.categoryId
        ? "Transaction created"
        : "Transaction created. Classification has been queued.";
      toast.success(successMessage);
      setAnnouncement(successMessage);
      reset({
        description: "",
        amountCents: "",
        accountId: accounts[0]?.id ?? "",
        currency: "NOK",
        date: todayString(),
        merchantName: "",
        categoryId: "",
        notes: "",
      });
      router.refresh();
    } catch (error) {
      showErrorToast("Could not create transaction", error);
    }
  });

  return (
    <form className="grid gap-4" onSubmit={onSubmit} noValidate>
      <LiveRegion message={announcement} />
      <FormField
        id="transaction-description"
        label="Description"
        error={errors.description?.message}
      >
        <Input
          id="transaction-description"
          aria-invalid={Boolean(errors.description)}
          aria-describedby={formFieldDescribedBy(
            "transaction-description",
            Boolean(errors.description),
          )}
          className={cn(errors.description && "border-destructive")}
          {...register("description")}
        />
      </FormField>

      <MoneyField
        id="transaction-amount"
        label="Amount"
        name="amountCents"
        register={register}
        error={errors.amountCents?.message}
        required
        onBlurNormalize={(value) =>
          setValue("amountCents", value, { shouldValidate: true })
        }
      />

      <FormSelectField
        control={control}
        name="accountId"
        id="transaction-account"
        label="Account"
        error={errors.accountId?.message}
        options={accounts.map((account) => ({
          value: account.id,
          label: account.name,
        }))}
      />

      <FormField
        id="transaction-currency"
        label="Currency"
        error={errors.currency?.message}
      >
        <Input
          id="transaction-currency"
          maxLength={3}
          aria-invalid={Boolean(errors.currency)}
          aria-describedby={formFieldDescribedBy(
            "transaction-currency",
            Boolean(errors.currency),
          )}
          className={cn(errors.currency && "border-destructive")}
          {...register("currency")}
        />
      </FormField>

      <FormField
        id="transaction-date"
        label="Date"
        error={errors.date?.message}
      >
        <Input
          id="transaction-date"
          type="date"
          aria-invalid={Boolean(errors.date)}
          aria-describedby={formFieldDescribedBy(
            "transaction-date",
            Boolean(errors.date),
          )}
          className={cn(errors.date && "border-destructive")}
          {...register("date")}
        />
      </FormField>

      <FormField id="transaction-merchant" label="Merchant">
        <Input
          id="transaction-merchant"
          placeholder="Optional"
          {...register("merchantName")}
        />
      </FormField>

      <FormSelectField
        control={control}
        name="categoryId"
        id="transaction-category"
        label="Category"
        options={[
          { value: "", label: "Uncategorized" },
          ...categories.map((category) => ({
            value: category.id,
            label: category.name,
          })),
        ]}
      />

      <FormField id="transaction-notes" label="Notes">
        <Input
          id="transaction-notes"
          placeholder="Optional"
          {...register("notes")}
        />
      </FormField>

      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Creating...
          </>
        ) : (
          "Create transaction"
        )}
      </Button>
    </form>
  );
}
