"use client";

import type { FieldPath, FieldValues, UseFormRegister } from "react-hook-form";

import { Input } from "@/components/ui/input";
import {
  centsToDecimalString,
  parseMoneyToCents,
} from "@/lib/finance/money";
import { cn } from "@/lib/utils";

import { FormField, formFieldDescribedBy } from "./form-field";

type MoneyFieldProps<T extends FieldValues> = {
  id: string;
  label: string;
  name: FieldPath<T>;
  register: UseFormRegister<T>;
  onBlurNormalize?: (value: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

export function MoneyField<T extends FieldValues>({
  id,
  label,
  name,
  register,
  onBlurNormalize,
  error,
  required,
  disabled,
  className,
}: MoneyFieldProps<T>) {
  const { onBlur, ...registerRest } = register(name);

  return (
    <FormField id={id} label={label} error={error} className={className}>
      <Input
        id={id}
        inputMode="decimal"
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={formFieldDescribedBy(id, Boolean(error))}
        className={cn(error && "border-destructive")}
        required={required}
        onBlur={(event) => {
          void onBlur(event);
          const raw = event.target.value.trim();
          if (!raw || !onBlurNormalize) {
            return;
          }
          try {
            onBlurNormalize(centsToDecimalString(parseMoneyToCents(raw)));
          } catch {
            // Keep raw input; Zod reports on submit/blur validation.
          }
        }}
        {...registerRest}
      />
    </FormField>
  );
}
