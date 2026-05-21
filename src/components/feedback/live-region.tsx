"use client";

import { cn } from "@/lib/utils";

type LiveRegionProps = {
  message: string;
  politeness?: "polite" | "assertive";
  className?: string;
};

/**
 * Announces dynamic updates to screen readers without relying on toast alone.
 * The container is always rendered so screen readers register the live region
 * before content appears — conditional mounting causes missed announcements.
 */
export function LiveRegion({
  message,
  politeness = "polite",
  className,
}: LiveRegionProps) {
  return (
    <p
      aria-live={politeness}
      aria-atomic="true"
      className={cn("sr-only", className)}
    >
      {message}
    </p>
  );
}
