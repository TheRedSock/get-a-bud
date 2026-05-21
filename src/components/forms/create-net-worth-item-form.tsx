"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { createAsset, createLiability } from "@/app/(app)/net-worth/actions";
import { FormField, formFieldDescribedBy } from "@/components/forms/form-field";
import { MoneyField } from "@/components/forms/money-field";
import { formNativeSelectClassName } from "@/components/forms/native-select-styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrapAction } from "@/lib/actions/client";
import { createNetWorthItemFormSchema } from "@/lib/finance/validation";
import { showErrorToast } from "@/lib/toast-errors";
import { cn } from "@/lib/utils";

type NetWorthFormValues = z.input<typeof createNetWorthItemFormSchema>;

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

const assetDefaults: Extract<NetWorthFormValues, { itemType: "asset" }> = {
  itemType: "asset",
  name: "",
  kind: "property",
  currency: "NOK",
  estimatedValueCents: "",
  valuationDate: todayString(),
  notes: "",
};

const liabilityDefaults: Extract<NetWorthFormValues, { itemType: "liability" }> = {
  itemType: "liability",
  name: "",
  kind: "loan",
  currency: "NOK",
  currentBalanceCents: "",
  interestRate: undefined,
  minimumPaymentCents: undefined,
  dueDay: undefined,
  notes: "",
};

export function CreateNetWorthItemForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<NetWorthFormValues>({
    resolver: zodResolver(createNetWorthItemFormSchema),
    mode: "onBlur",
    defaultValues: assetDefaults,
  });

  const itemType = watch("itemType");

  function handleTypeChange(nextType: "asset" | "liability") {
    reset(nextType === "asset" ? assetDefaults : liabilityDefaults);
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      const trimmedNotes = values.notes?.trim();

      if (values.itemType === "asset") {
        await unwrapAction(
          createAsset({
            name: values.name,
            kind: values.kind,
            currency: values.currency,
            estimatedValueCents: values.estimatedValueCents,
            valuationDate: values.valuationDate,
            notes: trimmedNotes || undefined,
          }),
          "Could not create asset",
        );
        toast.success("Asset created");
        reset(assetDefaults);
      } else {
        await unwrapAction(
          createLiability({
            name: values.name,
            kind: values.kind,
            currency: values.currency,
            currentBalanceCents: values.currentBalanceCents,
            interestRate: values.interestRate,
            minimumPaymentCents: values.minimumPaymentCents,
            dueDay: values.dueDay,
            notes: trimmedNotes || undefined,
          }),
          "Could not create liability",
        );
        toast.success("Liability created");
        reset(liabilityDefaults);
      }

      router.refresh();
    } catch (error) {
      showErrorToast(
        itemType === "asset" ? "Could not create asset" : "Could not create liability",
        error,
      );
    }
  });

  return (
    <form className="grid gap-4" onSubmit={onSubmit} noValidate>
      <FormField
        id="nw-item-name"
        label="Name"
        error={"name" in errors ? errors.name?.message : undefined}
      >
        <Input
          id="nw-item-name"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={formFieldDescribedBy("nw-item-name", Boolean(errors.name))}
          className={cn(errors.name && "border-destructive")}
          {...register("name")}
        />
      </FormField>

      <FormField id="nw-item-type" label="Type">
        <select
          id="nw-item-type"
          className={formNativeSelectClassName}
          value={itemType}
          onChange={(event) =>
            handleTypeChange(event.target.value as "asset" | "liability")
          }
        >
          <option value="asset">Asset</option>
          <option value="liability">Liability</option>
        </select>
      </FormField>

      <FormField id="nw-item-kind" label="Kind">
        <Input id="nw-item-kind" {...register("kind")} />
      </FormField>

      <FormField
        id="nw-item-currency"
        label="Currency"
        error={"currency" in errors ? errors.currency?.message : undefined}
      >
        <Input
          id="nw-item-currency"
          maxLength={3}
          className={cn(errors.currency && "border-destructive")}
          {...register("currency")}
        />
      </FormField>

      {itemType === "asset" ? (
        <>
          <MoneyField
            id="nw-item-value"
            label="Value"
            name="estimatedValueCents"
            register={register}
            error={
              "estimatedValueCents" in errors
                ? errors.estimatedValueCents?.message
                : undefined
            }
            required
            onBlurNormalize={(value) =>
              setValue("estimatedValueCents", value, { shouldValidate: true })
            }
          />
          <FormField id="nw-item-valuation-date" label="Valuation date">
            <Input
              id="nw-item-valuation-date"
              type="date"
              {...register("valuationDate")}
            />
          </FormField>
        </>
      ) : (
        <>
          <MoneyField
            id="nw-item-value"
            label="Balance"
            name="currentBalanceCents"
            register={register}
            error={
              "currentBalanceCents" in errors
                ? errors.currentBalanceCents?.message
                : undefined
            }
            required
            onBlurNormalize={(value) =>
              setValue("currentBalanceCents", value, { shouldValidate: true })
            }
          />
          <FormField id="nw-item-interest-rate" label="Interest rate (%)">
            <Input
              id="nw-item-interest-rate"
              type="number"
              inputMode="decimal"
              placeholder="Optional"
              {...register("interestRate", {
                setValueAs: (value) =>
                  value === "" || value == null ? undefined : Number(value),
              })}
            />
          </FormField>
          <MoneyField
            id="nw-item-min-payment"
            label="Minimum payment"
            name="minimumPaymentCents"
            register={register}
            onBlurNormalize={(value) =>
              setValue("minimumPaymentCents", value, { shouldValidate: true })
            }
          />
          <FormField id="nw-item-due-day" label="Due day">
            <Input
              id="nw-item-due-day"
              type="number"
              min={1}
              max={31}
              placeholder="Optional"
              {...register("dueDay", {
                setValueAs: (value) =>
                  value === "" || value == null ? undefined : Number(value),
              })}
            />
          </FormField>
        </>
      )}

      <FormField id="nw-item-notes" label="Notes">
        <Input
          id="nw-item-notes"
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
        ) : itemType === "asset" ? (
          "Create asset"
        ) : (
          "Create liability"
        )}
      </Button>
    </form>
  );
}
