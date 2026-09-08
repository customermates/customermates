import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";

export function WikiPageSkeleton({ animated = true }: { animated?: boolean }) {
  return (
    <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-border p-4 md:block">
        <Shape animated={animated} className="mb-5 h-8 w-full rounded-md" />

        <div className="space-y-2">
          <Shape animated={animated} className="h-9 w-full rounded-md" motionPhase={1} />

          <Shape animated={animated} className="h-9 w-4/5 rounded-md" motionPhase={2} />

          <Shape animated={animated} className="h-9 w-11/12 rounded-md" motionPhase={3} />
        </div>
      </aside>

      <main className="space-y-5 p-4 md:p-6">
        <Shape breathe animated={animated} className="h-8 w-2/3" />

        <Shape animated={animated} className="h-4 w-full" motionPhase={1} />

        <Shape animated={animated} className="h-4 w-11/12" motionPhase={2} />

        <Shape animated={animated} className="h-4 w-4/5" motionPhase={3} />
      </main>
    </div>
  );
}
