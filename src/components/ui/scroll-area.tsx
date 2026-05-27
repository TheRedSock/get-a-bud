"use client";

import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import type * as React from "react";

import { cn } from "@/lib/utils";

export function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      {children}
    </ScrollAreaPrimitive.Root>
  );
}

export function ScrollAreaViewport({
  className,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Viewport>) {
  return (
    <ScrollAreaPrimitive.Viewport
      className={cn("size-full rounded-[inherit]", className)}
      {...props}
    />
  );
}

export function ScrollAreaScrollbar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Scrollbar>) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      orientation={orientation}
      className={cn(
        "flex touch-none select-none transition-colors",
        orientation === "vertical" &&
          "z-10 my-2 mr-1 h-[calc(100%-1rem)] w-2.5 shrink-0 p-px",
        orientation === "horizontal" &&
          "mx-2 mb-1 h-2.5 w-[calc(100%-1rem)] shrink-0 p-px",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        className={cn(
          "relative flex-1 rounded-full",
          "bg-muted-foreground/40 hover:bg-muted-foreground/55",
        )}
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}
