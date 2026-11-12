import { Skeleton } from "@/components/ui/skeleton";

export function AutomationsPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      <Skeleton className="h-6 w-40" />

      <Skeleton className="h-4 w-80 max-w-full" />

      {[0, 1, 2].map((item) => (
        <Skeleton key={item} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}
