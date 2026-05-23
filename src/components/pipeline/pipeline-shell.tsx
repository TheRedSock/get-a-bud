"use client";

import { PipelineBanner } from "@/components/pipeline/pipeline-banner";
import { PipelineLiveProvider } from "@/components/pipeline/pipeline-live-context";

export function PipelineShell({ children }: { children: React.ReactNode }) {
  return (
    <PipelineLiveProvider>
      <PipelineBanner />
      {children}
    </PipelineLiveProvider>
  );
}
