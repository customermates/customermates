import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";

export function WikiPageSkeleton({
  animated = true,
  documentOnly = false,
}: {
  animated?: boolean;
  documentOnly?: boolean;
}) {
  return (
    <div
      className={
        documentOnly ? "h-full min-h-80" : "grid h-full min-h-0 grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)]"
      }
    >
      {!documentOnly && (
        <aside className="hidden border-r border-border p-4 lg:block">
          <Shape animated={animated} className="mb-5 h-8 w-full rounded-md" />

          <div className="space-y-2">
            <Shape animated={animated} className="h-9 w-full rounded-md" motionPhase={1} />

            <Shape animated={animated} className="h-9 w-4/5 rounded-md" motionPhase={2} />

            <Shape animated={animated} className="h-9 w-11/12 rounded-md" motionPhase={3} />
          </div>
        </aside>
      )}

      <div className="mx-auto w-full max-w-3xl space-y-5 px-6 py-8 md:px-10 md:py-10">
        <Shape breathe animated={animated} className="h-8 w-2/3" />

        <Shape animated={animated} className="h-4 w-full" motionPhase={1} />

        <Shape animated={animated} className="h-4 w-11/12" motionPhase={2} />

        <Shape animated={animated} className="h-4 w-4/5" motionPhase={3} />
      </div>
    </div>
  );
}
