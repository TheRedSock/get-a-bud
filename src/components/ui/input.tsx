import type * as React from "react";

import { cn } from "@/lib/utils";

const inputBaseClassName =
  "h-11 w-full rounded-2xl border border-input bg-background/60 px-4 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const dateInputClassName = [
  "relative block text-left",
  "[&::-webkit-calendar-picker-indicator]:absolute",
  "[&::-webkit-calendar-picker-indicator]:right-4",
  "[&::-webkit-calendar-picker-indicator]:top-1/2",
  "[&::-webkit-calendar-picker-indicator]:-translate-y-1/2",
  "[&::-webkit-calendar-picker-indicator]:cursor-pointer",
  "[&::-webkit-calendar-picker-indicator]:opacity-60",
  "[&::-webkit-datetime-edit]:pe-8",
].join(" ");

export function Input({
  className,
  type,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        inputBaseClassName,
        type === "date" ? dateInputClassName : "flex",
        className,
      )}
      {...props}
    />
  );
}
