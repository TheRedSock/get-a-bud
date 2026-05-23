"use client";

import { useMemo } from "react";

import { usePipelineLiveOptional } from "@/components/pipeline/pipeline-live-context";

export function useRegisterFrozenRow() {
  const ctx = usePipelineLiveOptional();
  const register = ctx?.registerFrozenRow;
  const unregister = ctx?.unregisterFrozenRow;

  return useMemo(
    () => ({
      register: (id: string) => register?.(id),
      unregister: (id: string) => unregister?.(id),
    }),
    [register, unregister],
  );
}
