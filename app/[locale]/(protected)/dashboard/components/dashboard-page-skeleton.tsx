import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";

type Props = { animated?: boolean };

const CARDS = Array.from({ length: 4 }, (_, index) => index);
const ROWS = Array.from({ length: 4 }, (_, index) => index);

export function DashboardPageSkeleton({ animated = true }: Props) {
  return (
    <div
      data-dashboard-page-skeleton
      aria-hidden="true"
      className="grid min-h-[34rem] grid-cols-1 gap-4 md:grid-cols-2"
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-skeleton-kind="dashboard"
    >
      {CARDS.map((card) => (
        <div
          key={card}
          className="flex h-[264px] flex-col gap-0 rounded-xl border border-border bg-card py-0 shadow-xs"
          data-dashboard-card={card}
          data-skeleton-group={card}
        >
          <div className="flex w-full shrink-0 flex-col items-start gap-0.5 p-6 pb-0">
            <Shape breathe animated={animated} className="h-4 w-32" />

            <Shape animated={animated} className="h-2.5 w-20" motionPhase={1} />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
            {card === 0 ? (
              <div className="flex flex-1 items-end gap-3 pt-4">
                {[45, 72, 58, 88, 64, 78].map((height, index) => (
                  <Shape
                    key={index}
                    animated={animated}
                    breathe={index === 0}
                    className="flex-1"
                    motionPhase={index < 3 ? 2 : 3}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            ) : card === 1 ? (
              <div className="flex flex-1 items-center gap-6">
                <Shape
                  breathe
                  animated={animated}
                  className="size-32 shrink-0 rounded-full border-[16px] border-placeholder bg-transparent"
                  motionPhase={2}
                />

                <div className="flex flex-1 flex-col gap-4">
                  {ROWS.slice(0, 3).map((row) => (
                    <div key={row} className="flex items-center gap-2">
                      <Shape animated={animated} className="size-3 rounded-full" motionPhase={row === 0 ? 2 : 3} />

                      <Shape animated={animated} className="h-3 flex-1" motionPhase={row === 0 ? 2 : 3} />
                    </div>
                  ))}
                </div>
              </div>
            ) : card === 2 ? (
              <div className="flex flex-1 flex-col justify-center gap-4">
                {[82, 64, 45, 72].map((width, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <Shape animated={animated} className="h-3 w-20 shrink-0" motionPhase={index < 2 ? 2 : 3} />

                    <Shape
                      animated={animated}
                      breathe={index === 0}
                      className="h-5"
                      motionPhase={index < 2 ? 2 : 3}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid flex-1 grid-cols-2 gap-4">
                {ROWS.map((row) => (
                  <div key={row} className="flex flex-col justify-center gap-3 rounded-lg bg-placeholder p-4">
                    <Shape animated={animated} className="h-3 w-16" motionPhase={row < 2 ? 2 : 3} />

                    <Shape animated={animated} breathe={row === 0} className="h-7 w-24" motionPhase={row < 2 ? 2 : 3} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
