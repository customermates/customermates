import { Skeleton } from "@/components/ui/skeleton";

export function RecentlyDeletedSkeleton({ animated = true }: { animated?: boolean }) {
  return (
    <div className="flex w-full max-w-3xl flex-col divide-y divide-border rounded-xl border border-border bg-card">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <Skeleton animated={animated} className="size-4 shrink-0" />

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton animated={animated} className="h-4 w-40" />

            <Skeleton animated={animated} className="h-3 w-28" />
          </div>

          <Skeleton animated={animated} className="hidden h-3 w-32 sm:block" />
        </div>
      ))}
    </div>
  );
}
