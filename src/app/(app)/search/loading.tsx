import { Skeleton } from "@/components/feedback/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function SearchLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />

      <Card>
        <CardContent className="space-y-3 pt-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
