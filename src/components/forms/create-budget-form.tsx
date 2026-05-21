"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { createBudget } from "@/app/(app)/budgets/actions";
import { LiveRegion } from "@/components/feedback/live-region";
import { FormField, formFieldDescribedBy } from "@/components/forms/form-field";
import { formNativeSelectClassName } from "@/components/forms/native-select-styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrapAction } from "@/lib/actions/client";
import { createBudgetSchema } from "@/lib/finance/validation";
import { showErrorToast } from "@/lib/toast-errors";
import { cn } from "@/lib/utils";

type CreateBudgetFormValues = z.input<typeof createBudgetSchema>;

const budgetTypes = ["monthly", "weekly", "zero_based", "envelope"] as const;

export function CreateBudgetForm() {
  const router = useRouter();
  const [announcement, setAnnouncement] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateBudgetFormValues>({
    resolver: zodResolver(createBudgetSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      type: "monthly",
      currency: "NOK",
      periodStartDay: 1,
      paycheckAnchorDay: undefined,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await unwrapAction(
        createBudget(values),
        "Could not create budget",
      );
      const successMessage = "Budget created";
      toast.success(successMessage);
      setAnnouncement(successMessage);
      reset({
        name: "",
        type: "monthly",
        currency: "NOK",
        periodStartDay: 1,
        paycheckAnchorDay: undefined,
      });
      router.refresh();
    } catch (error) {
      showErrorToast("Could not create budget", error);
    }
  });

  return (
    <form className="grid gap-4" onSubmit={onSubmit} noValidate>
      <LiveRegion message={announcement} />
      <FormField id="budget-name" label="Name" error={errors.name?.message}>
        <Input
          id="budget-name"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={formFieldDescribedBy("budget-name", Boolean(errors.name))}
          className={cn(errors.name && "border-destructive")}
          {...register("name")}
        />
      </FormField>

      <FormField id="budget-type" label="Type" error={errors.type?.message}>
        <select
          id="budget-type"
          aria-invalid={Boolean(errors.type)}
          aria-describedby={formFieldDescribedBy("budget-type", Boolean(errors.type))}
          className={cn(formNativeSelectClassName, errors.type && "border-destructive")}
          {...register("type")}
        >
          {budgetTypes.map((budgetType) => (
            <option key={budgetType} value={budgetType}>
              {budgetType.replace("_", " ")}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        id="budget-currency"
        label="Currency"
        error={errors.currency?.message}
      >
        <Input
          id="budget-currency"
          maxLength={3}
          aria-invalid={Boolean(errors.currency)}
          aria-describedby={formFieldDescribedBy(
            "budget-currency",
            Boolean(errors.currency),
          )}
          className={cn(errors.currency && "border-destructive")}
          {...register("currency")}
        />
      </FormField>

      <FormField
        id="budget-period-start"
        label="Period start day"
        error={errors.periodStartDay?.message}
      >
        <Input
          id="budget-period-start"
          type="number"
          min={1}
          max={31}
          aria-invalid={Boolean(errors.periodStartDay)}
          aria-describedby={formFieldDescribedBy(
            "budget-period-start",
            Boolean(errors.periodStartDay),
          )}
          className={cn(errors.periodStartDay && "border-destructive")}
          {...register("periodStartDay", { valueAsNumber: true })}
        />
      </FormField>

      <FormField
        id="budget-paycheck-anchor"
        label="Paycheck anchor day"
        error={errors.paycheckAnchorDay?.message}
      >
        <Input
          id="budget-paycheck-anchor"
          type="number"
          min={1}
          max={31}
          placeholder="Optional"
          aria-invalid={Boolean(errors.paycheckAnchorDay)}
          aria-describedby={formFieldDescribedBy(
            "budget-paycheck-anchor",
            Boolean(errors.paycheckAnchorDay),
          )}
          className={cn(errors.paycheckAnchorDay && "border-destructive")}
          {...register("paycheckAnchorDay", {
            setValueAs: (value) =>
              value === "" || value == null ? undefined : Number(value),
          })}
        />
      </FormField>

      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Creating...
          </>
        ) : (
          "Create budget"
        )}
      </Button>
    </form>
  );
}
