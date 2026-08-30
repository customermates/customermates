import { Skeleton } from "@/components/ui/skeleton";

type Props = { animated?: boolean };

export function OperatorOverviewSkeleton({ animated = true }: Props) {
  return (
    <div data-operator-overview-skeleton className="flex min-h-0 w-full flex-1 flex-col gap-4 md:gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} animated={animated} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
