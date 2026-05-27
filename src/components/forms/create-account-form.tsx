"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { createAccount } from "@/app/(app)/accounts/actions";
import { LiveRegion } from "@/components/feedback/live-region";
import { FormField, formFieldDescribedBy } from "@/components/forms/form-field";
import { FormSelectField } from "@/components/forms/form-select";
import { MoneyField } from "@/components/forms/money-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrapAction } from "@/lib/actions/client";
import { createAccountSchema } from "@/lib/finance/validation";
import { showErrorToast } from "@/lib/toast-errors";
import { cn } from "@/lib/utils";

type CreateAccountFormValues = z.input<typeof createAccountSchema>;

const accountKinds = [
  "checking",
  "savings",
  "credit_card",
  "cash",
  "investment",
  "loan",
  "mortgage",
  "property",
  "other",
] as const;

export function CreateAccountForm() {
  const router = useRouter();
  const [announcement, setAnnouncement] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateAccountFormValues>({
    resolver: zodResolver(createAccountSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      kind: "checking",
      currency: "NOK",
      currentBalanceCents: "0",
      institutionName: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const trimmedInstitution = values.institutionName?.trim();
      const payload = {
        ...values,
        institutionName: trimmedInstitution || undefined,
      };

      await unwrapAction(createAccount(payload), "Could not create account");
      const successMessage = "Account created";
      toast.success(successMessage);
      setAnnouncement(successMessage);
      reset({
        name: "",
        kind: "checking",
        currency: "NOK",
        currentBalanceCents: "0",
        institutionName: "",
      });
      router.refresh();
    } catch (error) {
      showErrorToast("Could not create account", error);
    }
  });

  return (
    <form className="grid gap-4" onSubmit={onSubmit} noValidate>
      <LiveRegion message={announcement} />
      <FormField id="account-name" label="Name" error={errors.name?.message}>
        <Input
          id="account-name"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={formFieldDescribedBy("account-name", Boolean(errors.name))}
          className={cn(errors.name && "border-destructive")}
          {...register("name")}
        />
      </FormField>

      <FormSelectField
        control={control}
        name="kind"
        id="account-kind"
        label="Type"
        error={errors.kind?.message}
        options={accountKinds.map((accountKind) => ({
          value: accountKind,
          label: accountKind.replace("_", " "),
        }))}
      />

      <FormField
        id="account-currency"
        label="Currency"
        error={errors.currency?.message}
      >
        <Input
          id="account-currency"
          maxLength={3}
          aria-invalid={Boolean(errors.currency)}
          aria-describedby={formFieldDescribedBy(
            "account-currency",
            Boolean(errors.currency),
          )}
          className={cn(errors.currency && "border-destructive")}
          {...register("currency")}
        />
      </FormField>

      <MoneyField
        id="account-balance"
        label="Starting balance"
        name="currentBalanceCents"
        register={register}
        error={errors.currentBalanceCents?.message}
        onBlurNormalize={(value) =>
          setValue("currentBalanceCents", value, { shouldValidate: true })
        }
      />

      <FormField id="account-institution" label="Institution">
        <Input
          id="account-institution"
          placeholder="Optional"
          {...register("institutionName")}
        />
      </FormField>

      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Creating...
          </>
        ) : (
          "Create account"
        )}
      </Button>
    </form>
  );
}
