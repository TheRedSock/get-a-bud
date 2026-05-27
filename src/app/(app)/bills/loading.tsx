import { BILLS_LIST_GRID_COLS } from "@/components/bills/bills-list";
import { Skeleton } from "@/components/feedback/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function BillsLoading() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="grid gap-4">
          <Skeleton className="h-10 w-full rounded-2xl" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-full" />
            ))}
          </div>
          <div className={cn("grid gap-x-3 gap-y-3", BILLS_LIST_GRID_COLS)}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="col-span-full grid gap-3 rounded-3xl border py-4 sm:grid-cols-subgrid sm:items-center sm:gap-x-3 sm:gap-y-0"
              >
                <Skeleton className="h-5 w-3/4 pl-4" />
                <Skeleton className="h-8 w-full pl-4 sm:pl-0" />
                <Skeleton className="h-5 w-16 pl-4 sm:ml-auto sm:pl-0" />
                <Skeleton className="h-5 w-20 pl-4 sm:pl-0" />
                <Skeleton className="mr-4 size-9 justify-self-end rounded-full sm:mr-4" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="h-fit">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
