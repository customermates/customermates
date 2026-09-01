import { Skeleton } from "@/components/ui/skeleton";

type Props = { animated?: boolean };

export function RoutineDetailSkeleton({ animated = true }: Props) {
  return (
    <div data-routine-detail-skeleton className="flex flex-col gap-4">
      <Skeleton className={animated ? "h-24 w-full" : "h-24 w-full animate-none"} />

      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Skeleton className={animated ? "h-72 w-full" : "h-72 w-full animate-none"} />

        <Skeleton className={animated ? "h-72 w-full" : "h-72 w-full animate-none"} />
      </div>
    </div>
  );
}
