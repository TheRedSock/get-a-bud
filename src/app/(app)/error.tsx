"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AppErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Could not load this view</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          The app hit an unexpected problem while loading your finance data. Try
          again, and avoid re-entering sensitive details until the page reloads.
        </p>
        <Button className="mt-5" type="button" onClick={reset}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
