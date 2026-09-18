/**
 * Fixed locale for UI timestamps. Node and browsers default to different locales,
 * which causes hydration mismatches when formatting dates during SSR.
 */
export const APP_DATETIME_LOCALE = "en-US";

export function formatAppDateTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString(APP_DATETIME_LOCALE, {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

export function formatAppDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString(APP_DATETIME_LOCALE, {
    dateStyle: "medium",
  });
}
