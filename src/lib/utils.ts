import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const currencyFormatter = new Intl.NumberFormat("nb-NO", {
  style: "currency",
  currency: "NOK",
  maximumFractionDigits: 0,
});

/** Cached formatters keyed by currency code (P3-1). */
const formatterCache = new Map<string, Intl.NumberFormat>();

export function formatMoney(value: number, currency = "NOK") {
  let formatter = formatterCache.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("nb-NO", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });
    formatterCache.set(currency, formatter);
  }
  return formatter.format(value);
}
