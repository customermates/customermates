import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";
import { cn } from "@/core/utils/cn";

type Props = { animated?: boolean };

const FORM_ROWS = Array.from({ length: 4 }, (_, index) => index);
const TIMELINE_ROWS = Array.from({ length: 6 }, (_, index) => index);

function FormFieldSkeleton({ animated, short = false }: { animated: boolean; short?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Shape breathe animated={animated} className={cn("h-3", short ? "w-20" : "w-28")} />

      <Shape animated={animated} className="h-9 w-full rounded-md" motionPhase={1} />
    </div>
  );
}

function SectionHeader({
  animated,
  labelWidth,
  endAction = false,
}: {
  animated: boolean;
  labelWidth: string;
  endAction?: boolean;
}) {
  return (
    <div className="flex h-4 shrink-0 items-center px-4 pt-4 pb-1.5 box-content">
      <Shape breathe animated={animated} className={cn("h-2.5", labelWidth)} motionPhase={1} />

      {endAction && <Shape animated={animated} className="ml-auto size-3 rounded" />}
    </div>
  );
}

export function EntityDetailPageSkeleton({ animated = true }: Props) {
  return (
    <div
      data-entity-detail-page-skeleton
      aria-hidden="true"
      className="@container/detail flex size-full min-h-0 flex-col overflow-y-auto @4xl/detail:overflow-y-visible"
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-skeleton-kind="detail"
    >
      <div className="grid grid-cols-1 gap-px bg-border contain-[layout] @4xl/detail:min-h-0 @4xl/detail:flex-1 @4xl/detail:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] @6xl/detail:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_360px]">
        <div
          className="flex flex-col bg-background @4xl/detail:min-h-0 @4xl/detail:overflow-auto"
          data-skeleton-group="0"
        >
          <div className="p-4 @4xl/detail:min-h-0 @4xl/detail:flex-1">
            <div className="flex w-full flex-col gap-4">
              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                <div data-skeleton-group="1">
                  <FormFieldSkeleton short animated={animated} />
                </div>

                <FormFieldSkeleton short animated={animated} />
              </div>

              {FORM_ROWS.map((row) => (
                <div key={row} data-skeleton-group={row % 4}>
                  <FormFieldSkeleton animated={animated} short={row % 2 === 0} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-px bg-border @4xl/detail:min-h-0 @6xl/detail:contents">
          <div
            className="flex flex-col bg-background @4xl/detail:min-h-0 @4xl/detail:flex-2 @4xl/detail:overflow-hidden"
            data-skeleton-group="1"
          >
            <SectionHeader animated={animated} labelWidth="w-16" />

            <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
              <Shape animated={animated} className="min-h-52 w-full" motionPhase={2} />
            </div>
          </div>

          <div
            className="flex flex-col bg-background @4xl/detail:min-h-0 @4xl/detail:flex-1 @4xl/detail:overflow-hidden"
            data-skeleton-group="2"
          >
            <SectionHeader endAction animated={animated} labelWidth="w-20" />

            <div className="min-h-0 flex-1 overflow-auto px-2 pb-4">
              {TIMELINE_ROWS.map((row) => (
                <div key={row} className="flex items-start gap-3 rounded-md p-2" data-skeleton-group={row % 4}>
                  <Shape animated={animated} className="size-8 shrink-0 rounded-lg" />

                  <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <Shape animated={animated} breathe={row === 0} className="h-3 w-3/5" motionPhase={1} />

                      <Shape animated={animated} className="h-2.5 w-12" motionPhase={2} />
                    </div>

                    <Shape animated={animated} className="h-2.5 w-4/5" motionPhase={3} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EntityDetailDrawerSkeleton({ animated = true, showFooter = true }: Props & { showFooter?: boolean }) {
  return (
    <div
      data-entity-detail-drawer-skeleton
      aria-hidden="true"
      className="flex size-full min-h-0 flex-col overflow-hidden"
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-skeleton-kind="detail"
      data-skeleton-view="drawer"
    >
      <div className="flex shrink-0 items-center p-6 pb-0 pr-14" data-skeleton-group="0">
        <Shape breathe animated={animated} className="h-5 w-24" />
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto p-6 overscroll-contain"
        data-skeleton-scroll-owner="entity-drawer-body"
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              <FormFieldSkeleton short animated={animated} />

              <FormFieldSkeleton short animated={animated} />
            </div>

            {FORM_ROWS.map((row) => (
              <div key={row} data-skeleton-group={row % 4}>
                <FormFieldSkeleton animated={animated} short={row % 2 === 0} />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2" data-skeleton-group="2">
            <Shape breathe animated={animated} className="h-3 w-16" />

            <Shape animated={animated} className="min-h-40 w-full rounded-md" motionPhase={2} />
          </div>
        </div>
      </div>

      {showFooter ? (
        <div
          data-entity-drawer-footer
          className="flex w-full shrink-0 justify-end p-6 pt-0 pb-[calc(1.5rem+var(--safe-bottom))]"
          data-skeleton-group="3"
        >
          <Shape animated={animated} className="h-9 w-24 rounded-md" motionPhase={3} />
        </div>
      ) : null}
    </div>
  );
}
