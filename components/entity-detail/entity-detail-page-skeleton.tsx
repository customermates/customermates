import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";
import { cn } from "@/core/utils/cn";

type Props = { animated?: boolean; showSummary?: boolean; summaryItemCount?: number };

const FORM_ROWS = Array.from({ length: 4 }, (_, index) => index);
const TIMELINE_ROWS = Array.from({ length: 6 }, (_, index) => index);
const MOTION_PHASES = [0, 1, 2, 3] as const;

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

      {endAction ? <Shape animated={animated} className="ml-auto size-3 rounded" motionPhase={2} /> : null}
    </div>
  );
}

function DetailSectionHeader({ animated, labelWidth }: { animated: boolean; labelWidth: string }) {
  return (
    <div data-entity-detail-skeleton-section className="flex h-13 shrink-0 items-center px-4">
      <Shape breathe animated={animated} className={cn("h-3", labelWidth)} motionPhase={1} />

      <Shape animated={animated} className="ml-auto size-4 rounded" motionPhase={2} />
    </div>
  );
}

export function EntityDetailPageSkeleton({
  animated = true,
  showSummary = false,
  summaryItemCount = 4,
  showNotesPanel = true,
  showActivityPanel = false,
}: Props & { showNotesPanel?: boolean; showActivityPanel?: boolean }) {
  const panelCount = 1 + Number(showNotesPanel) + Number(showActivityPanel);

  return (
    <div
      data-entity-detail-page-skeleton
      aria-hidden="true"
      className="@container/detail size-full min-h-0"
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-skeleton-kind="detail"
    >
      <div
        data-entity-detail-skeleton-shell
        className="flex size-full min-h-0 flex-col overflow-y-auto @6xl/detail:overflow-y-visible"
      >
        {showSummary ? (
          <div
            data-entity-detail-skeleton-summary
            className="h-[68px] shrink-0 overflow-hidden border-b border-border px-4"
          >
            <div className="flex h-full w-max min-w-full items-stretch divide-x divide-border">
              {Array.from({ length: summaryItemCount }, (_, index) => (
                <div key={index} className="flex w-32 shrink-0 flex-col justify-center p-3 first:pl-0 last:pr-0">
                  <Shape
                    animated={animated}
                    className="h-2.5 w-16"
                    motionPhase={MOTION_PHASES[index % MOTION_PHASES.length] ?? 0}
                  />

                  <Shape animated={animated} breathe={index === 0} className="mt-2 h-4 w-20" motionPhase={1} />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {panelCount > 1 ? (
          <div
            data-entity-detail-skeleton-tabs
            className="h-13 shrink-0 border-b border-border bg-background @6xl/detail:hidden"
          >
            <div className="grid size-full grid-flow-col auto-cols-fr">
              {Array.from({ length: panelCount }, (_, tab) => (
                <div key={tab} className="relative flex items-center justify-center px-4" data-skeleton-group={tab}>
                  <Shape
                    animated={animated}
                    breathe={tab === 0}
                    className="h-3 w-12"
                    motionPhase={MOTION_PHASES[tab % MOTION_PHASES.length] ?? 0}
                  />

                  {tab === 0 ? <div className="absolute inset-x-0 -bottom-px h-0.5 bg-primary/40" /> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div
          className={cn(
            "grid grid-cols-1 gap-px bg-border contain-[layout] @6xl/detail:min-h-0 @6xl/detail:flex-1",
            showNotesPanel && showActivityPanel && "@6xl/detail:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_360px]",
            showNotesPanel && !showActivityPanel && "@6xl/detail:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
            !showNotesPanel && showActivityPanel && "@6xl/detail:grid-cols-[minmax(0,1fr)_360px]",
          )}
        >
          <div
            className="flex flex-col bg-background @6xl/detail:min-h-0 @6xl/detail:overflow-auto"
            data-skeleton-group="0"
          >
            <div className="p-4 @6xl/detail:min-h-0 @6xl/detail:flex-1">
              <div className="-mx-4 -mt-4 flex flex-col @6xl/detail:mt-0">
                <div className="border-b border-border">
                  <DetailSectionHeader animated={animated} labelWidth="w-20" />

                  <div className="flex flex-col gap-4 px-4 pb-4">
                    <div data-skeleton-group="1">
                      <FormFieldSkeleton short animated={animated} />
                    </div>

                    {FORM_ROWS.map((row) => (
                      <div key={row} data-skeleton-group={row % 4}>
                        <FormFieldSkeleton animated={animated} short={row % 2 === 0} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-b border-border">
                  <DetailSectionHeader animated={animated} labelWidth="w-16" />
                </div>

                <div className="border-b border-border">
                  <DetailSectionHeader animated={animated} labelWidth="w-24" />
                </div>
              </div>
            </div>
          </div>

          {showNotesPanel ? (
            <div
              className="hidden flex-col bg-background @6xl/detail:flex @6xl/detail:min-h-0 @6xl/detail:overflow-hidden"
              data-skeleton-group="1"
            >
              <SectionHeader animated={animated} labelWidth="w-16" />

              <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
                <Shape animated={animated} className="min-h-52 w-full" motionPhase={2} />
              </div>
            </div>
          ) : null}

          {showActivityPanel ? (
            <div
              className="hidden flex-col bg-background @6xl/detail:flex @6xl/detail:min-h-0 @6xl/detail:overflow-hidden"
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
          ) : null}
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
