import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/core/utils/cn";

export function SelectionValueSkeleton({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex h-5 items-center", className)} data-selection-loading="value">
      <Skeleton className="h-3.5 w-20 rounded-sm" />
    </span>
  );
}

export function SelectionOptionsSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div aria-label={label} className="space-y-1 p-1" data-selection-loading="options" role="status">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} aria-hidden="true" className="flex h-8 items-center gap-2 px-2">
          <Skeleton className="size-5 shrink-0 rounded-md" />

          <Skeleton className={cn("h-3.5 rounded-sm", index % 2 === 0 ? "w-28" : "w-20")} />
        </div>
      ))}
    </div>
  );
}
