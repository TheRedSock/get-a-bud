"use client";

import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { Controller } from "react-hook-form";

import { FormField, formFieldDescribedBy } from "@/components/forms/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Radix SelectItem does not accept an empty string value. */
const EMPTY_SELECT_VALUE = "__form_select_empty__";

export type FormSelectOption = {
  value: string;
  label: string;
};

function toRadixValue(value: string) {
  return value === "" ? EMPTY_SELECT_VALUE : value;
}

function fromRadixValue(value: string) {
  return value === EMPTY_SELECT_VALUE ? "" : value;
}

export type FormSelectProps = {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  onBlur?: () => void;
  options: FormSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

export function FormSelect({
  id,
  value,
  onValueChange,
  onBlur,
  options,
  placeholder,
  disabled,
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
}: FormSelectProps) {
  const hasEmptyOption = options.some((option) => option.value === "");
  const radixValue =
    value === "" ? (hasEmptyOption ? EMPTY_SELECT_VALUE : undefined) : toRadixValue(value);

  return (
    <Select
      disabled={disabled}
      value={radixValue}
      onValueChange={(next) => onValueChange(fromRadixValue(next))}
    >
      <SelectTrigger
        id={id}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
        className={cn(ariaInvalid && "border-destructive", className)}
        onBlur={onBlur}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value || EMPTY_SELECT_VALUE}
            value={toRadixValue(option.value)}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export type FormSelectFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  id: string;
  label: string;
  error?: string;
  options: FormSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function FormSelectField<TFieldValues extends FieldValues>({
  control,
  name,
  id,
  label,
  error,
  options,
  placeholder,
  disabled,
  className,
}: FormSelectFieldProps<TFieldValues>) {
  const hasError = Boolean(error);

  return (
    <FormField id={id} label={label} error={error}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <FormSelect
            id={id}
            value={field.value ?? ""}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            options={options}
            placeholder={placeholder}
            disabled={disabled}
            className={className}
            aria-invalid={hasError}
            aria-describedby={formFieldDescribedBy(id, hasError)}
          />
        )}
      />
    </FormField>
  );
}
