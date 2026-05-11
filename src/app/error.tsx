"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
        <div className="max-w-md rounded-3xl border bg-card p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">
            Something went wrong
          </p>
          <h1 className="mt-2 text-2xl font-semibold">We could not load this page.</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Try again now. If this keeps happening, the error has enough context
            for us to investigate without exposing sensitive details here.
          </p>
          <Button className="mt-5" type="button" onClick={reset}>
            Try again
          </Button>
        </div>
      </body>
    </html>
  );
}
