"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormField } from "@/components/forms/form-field";
import { MoneyField } from "@/components/forms/money-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formNativeSelectClassName } from "@/components/forms/native-select-styles";
import { createBill } from "@/app/(app)/bills/actions";
import { unwrapAction } from "@/lib/actions/client";
import { billCadenceSchema } from "@/lib/finance/validation";
import { showErrorToast } from "@/lib/toast-errors";

const cadenceOptions = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "semi_annual",
  "yearly",
  "unknown",
] as const;

const createBillFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  merchantPattern: z.string().trim().min(1).max(160),
  cadence: billCadenceSchema,
  categoryId: z.string().min(1),
  expectedAmountCents: z.string().optional(),
  nextDueDate: z.string().optional(),
});

type CreateBillFormValues = z.infer<typeof createBillFormSchema>;

export function CreateBillForm({
  categories,
}: {
  categories: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<CreateBillFormValues>({
    resolver: zodResolver(createBillFormSchema),
    defaultValues: {
      name: "",
      merchantPattern: "",
      cadence: "monthly",
      categoryId: "",
      expectedAmountCents: "",
      nextDueDate: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await unwrapAction(
        createBill({
          name: values.name,
          merchantPattern: values.merchantPattern || values.name,
          cadence: values.cadence,
          categoryId: values.categoryId,
          expectedAmountCents: values.expectedAmountCents?.trim()
            ? values.expectedAmountCents
            : undefined,
          nextDueDate: values.nextDueDate?.trim() || undefined,
        }),
        "Could not create bill",
      );
      toast.success("Bill created");
      router.refresh();
    } catch (error) {
      showErrorToast("Could not create bill", error);
    }
  });

  return (
    <form className="grid gap-3" noValidate onSubmit={onSubmit}>
      <FormField id="create-bill-name" label="Name" error={errors.name?.message}>
        <Input
          id="create-bill-name"
          {...register("name")}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && !getValues("merchantPattern")) {
              setValue("merchantPattern", name);
            }
          }}
        />
      </FormField>

      <FormField
        id="create-bill-merchant"
        label="Merchant pattern"
        error={errors.merchantPattern?.message}
      >
        <Input id="create-bill-merchant" {...register("merchantPattern")} />
      </FormField>

      <FormField id="create-bill-category" label="Category" error={errors.categoryId?.message}>
        <select
          id="create-bill-category"
          className={formNativeSelectClassName}
          {...register("categoryId")}
        >
          <option value="">Choose category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FormField>

      <FormField id="create-bill-cadence" label="Cadence" error={errors.cadence?.message}>
        <select
          id="create-bill-cadence"
          className={formNativeSelectClassName}
          {...register("cadence")}
        >
          {cadenceOptions.map((option) => (
            <option key={option} value={option}>
              {option.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </FormField>

      <MoneyField
        id="create-bill-amount"
        label="Expected amount (optional)"
        name="expectedAmountCents"
        register={register}
        error={errors.expectedAmountCents?.message}
      />

      <FormField
        id="create-bill-due"
        label="Next due date (optional)"
        error={errors.nextDueDate?.message}
      >
        <Input id="create-bill-due" type="date" {...register("nextDueDate")} />
      </FormField>

      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : null}
        Add bill
      </Button>
    </form>
  );
}
