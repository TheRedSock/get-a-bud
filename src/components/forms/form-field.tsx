"use client";

import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FormFieldProps = {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
};

export function FormField({ id, label, error, children, className }: FormFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p
          id={errorId}
          className="text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function formFieldDescribedBy(id: string, hasError: boolean) {
  return hasError ? `${id}-error` : undefined;
}
