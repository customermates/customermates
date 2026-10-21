import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { Skeleton } from "@/components/ui/skeleton";

export function PlannerSkeleton() {
  return (
    <AppCard className="flex min-h-0 flex-1 flex-col">
      <AppCardHeader>
        <Skeleton className="h-8 w-48" />
      </AppCardHeader>

      <AppCardBody className="grid min-h-0 flex-1 gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <Skeleton className="h-52 md:h-full" />

        <Skeleton className="h-96 md:h-full" />
      </AppCardBody>
    </AppCard>
  );
}
