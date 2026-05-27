"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type * as React from "react";

import { cn } from "@/lib/utils";

export function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root {...props} />;
}

const selectTriggerVariants = cva(
  "flex w-full items-center justify-between text-sm transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
  {
    variants: {
      variant: {
        default:
          "h-11 gap-2 rounded-2xl border border-input bg-background/60 py-2 pl-4 pr-3 shadow-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring",
        inline:
          "h-auto gap-2 rounded-lg border-0 bg-transparent px-2.5 py-1 font-normal text-muted-foreground shadow-none hover:bg-muted/50 hover:text-foreground focus:ring-1 focus:ring-ring [&>svg:last-child]:size-3.5 [&>svg:last-child]:opacity-40",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface SelectTriggerProps
  extends React.ComponentProps<typeof SelectPrimitive.Trigger>,
    VariantProps<typeof selectTriggerVariants> {}

export function SelectTrigger({
  className,
  variant,
  children,
  ...props
}: SelectTriggerProps) {
  return (
    <SelectPrimitive.Trigger
      className={cn(selectTriggerVariants({ variant, className }))}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export { selectTriggerVariants };

const selectMaxHeight =
  "max-h-[min(18rem,var(--radix-select-content-available-height))]";

// ---------------------------------------------------------------------------
// Custom scroll thumb — avoids native scrollbar entirely (no arrow buttons).
// Radix Select hides the native scrollbar; this renders a pill-shaped thumb
// positioned absolutely beside the viewport.
// ---------------------------------------------------------------------------

interface ScrollThumbState {
  visible: boolean;
  thumbHeight: number;
  thumbTop: number;
}

function SelectScrollThumb({
  viewportRef,
}: {
  viewportRef: React.RefObject<HTMLElement | null>;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ScrollThumbState>({
    visible: false,
    thumbHeight: 0,
    thumbTop: 0,
  });

  // Recalculate thumb dimensions/position
  const update = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    const { scrollHeight, clientHeight, scrollTop } = viewport;
    const hasOverflow = scrollHeight > clientHeight + 1;

    if (!hasOverflow) {
      setState({ visible: false, thumbHeight: 0, thumbTop: 0 });
      return;
    }

    const trackHeight = track.clientHeight;
    const ratio = clientHeight / scrollHeight;
    const thumbH = Math.max(ratio * trackHeight, 20);
    const maxTop = trackHeight - thumbH;
    const scrollRatio = scrollTop / (scrollHeight - clientHeight);

    setState({
      visible: true,
      thumbHeight: thumbH,
      thumbTop: scrollRatio * maxTop,
    });
  }, [viewportRef]);

  // Observe scroll, resize, and content changes
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    viewport.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(viewport);
    const mo = new MutationObserver(update);
    mo.observe(viewport, { childList: true, subtree: true });

    // Initial calculation (may need a frame for layout to settle)
    update();
    const raf = requestAnimationFrame(update);

    return () => {
      viewport.removeEventListener("scroll", update);
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [viewportRef, update]);

  // Drag-to-scroll
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const viewport = viewportRef.current;
      const track = trackRef.current;
      if (!viewport || !track) return;

      const startY = e.clientY;
      const startScrollTop = viewport.scrollTop;
      const { scrollHeight, clientHeight } = viewport;
      const trackHeight = track.clientHeight;
      const ratio = clientHeight / scrollHeight;
      const thumbH = Math.max(ratio * trackHeight, 20);
      const thumbRange = trackHeight - thumbH;
      const scrollRange = scrollHeight - clientHeight;

      const onMove = (ev: PointerEvent) => {
        const deltaY = ev.clientY - startY;
        viewport.scrollTop =
          startScrollTop + (deltaY / thumbRange) * scrollRange;
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [viewportRef],
  );

  return (
    <div
      ref={trackRef}
      className="absolute right-1.5 top-2 bottom-2 z-10 w-1.5"
      aria-hidden="true"
    >
      {state.visible && (
        <div
          className="absolute w-full cursor-pointer rounded-full bg-muted-foreground/40 transition-colors hover:bg-muted-foreground/60"
          style={{ height: state.thumbHeight, top: state.thumbTop }}
          onPointerDown={handlePointerDown}
        />
      )}
    </div>
  );
}

export function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  const viewportRef = useRef<HTMLDivElement>(null);

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className={cn(
          "relative z-50 flex min-w-[8rem] flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          selectMaxHeight,
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className,
        )}
        position={position}
        {...props}
      >
        <SelectPrimitive.Viewport
          ref={viewportRef}
          className={cn(
            selectMaxHeight,
            "w-full overflow-x-hidden overflow-y-auto py-2 pl-1.5 pr-5",
            position === "popper" &&
              "min-w-[var(--radix-select-trigger-width)]",
          )}
          style={{ scrollbarWidth: "none" }}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollThumb viewportRef={viewportRef} />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-xl py-2 pl-3 pr-8 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export function SelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value {...props} />;
}
