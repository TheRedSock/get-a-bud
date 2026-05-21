import { Skeleton } from "@/components/feedback/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function BudgetsLoading() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-4 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
