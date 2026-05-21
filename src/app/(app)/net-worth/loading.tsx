import { Skeleton } from "@/components/feedback/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function NetWorthLoading() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-40" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
