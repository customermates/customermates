import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";

import { DASHBOARD_GRID_MARGIN, DASHBOARD_ROW_HEIGHT } from "./grid.constants";
import { WIDGET_CARD_BODY_CLASS, WIDGET_CARD_HEADER_CLASS } from "./widget-card-frame";
import { cn } from "@/core/utils/cn";

type Props = { animated?: boolean };

const NUMBER_ROWS = 2;
const CHART_ROWS = 7;
const NUMBER_CARDS = [0, 1, 2, 3];
const CHART_CARDS = [
  { id: 4, span: "lg:col-span-5", bars: [45, 72, 58, 88, 64] },
  { id: 5, span: "lg:col-span-7", bars: [38, 52, 66, 48, 80, 72, 90] },
];

function cardHeight(rows: number) {
  return rows * DASHBOARD_ROW_HEIGHT + (rows - 1) * DASHBOARD_GRID_MARGIN;
}

const CARD_CLASS = "flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs";

export function DashboardPageSkeleton({ animated = true }: Props) {
  return (
    <div
      data-dashboard-page-skeleton
      aria-hidden="true"
      className="grid grid-cols-2 content-start lg:grid-cols-12"
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-skeleton-kind="dashboard"
      style={{ gap: DASHBOARD_GRID_MARGIN }}
    >
      {NUMBER_CARDS.map((card) => (
        <div
          key={card}
          className={cn(CARD_CLASS, "lg:col-span-3")}
          data-dashboard-card={card}
          data-skeleton-group={card}
          style={{ height: cardHeight(NUMBER_ROWS) }}
        >
          <div className={cn("flex", WIDGET_CARD_HEADER_CLASS)}>
            <Shape breathe animated={animated} className="h-3.5 w-28" />
          </div>

          <div className={cn("flex flex-1 items-end", WIDGET_CARD_BODY_CLASS)}>
            <Shape animated={animated} className="h-7 w-24" motionPhase={1} />
          </div>
        </div>
      ))}

      {CHART_CARDS.map((card) => (
        <div
          key={card.id}
          className={cn(CARD_CLASS, "col-span-2", card.span)}
          data-dashboard-card={card.id}
          data-skeleton-group={card.id}
          style={{ height: cardHeight(CHART_ROWS) }}
        >
          <div className={cn("flex", WIDGET_CARD_HEADER_CLASS)}>
            <Shape breathe animated={animated} className="h-3.5 w-36" />

            <Shape animated={animated} className="h-2.5 w-20" motionPhase={1} />
          </div>

          <div className={cn("flex min-h-0 flex-1 items-end gap-3", WIDGET_CARD_BODY_CLASS)}>
            {card.bars.map((height, index) => (
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
        </div>
      ))}
    </div>
  );
}

const MONTH_SKELETON_CELLS = Array.from({ length: 35 }, (_, index) => index);
const UPCOMING_SKELETON_ROWS = ["w-3/5", "w-2/5", "w-1/2", "w-2/3"];

export function CalendarWidgetSkeleton({ animated = true, layout }: Props & { layout: "upcoming" | "month" }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-full min-h-0 flex-col gap-3"
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-skeleton-kind="calendar-widget"
    >
      {layout === "month" ? (
        <>
          <Shape breathe animated={animated} className="mx-auto h-3.5 w-28" />

          <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-5 gap-1">
            {MONTH_SKELETON_CELLS.map((cell) => (
              <Shape key={cell} animated={animated} className="size-full rounded-md" motionPhase={cell % 2 ? 1 : 2} />
            ))}
          </div>
        </>
      ) : (
        UPCOMING_SKELETON_ROWS.map((width, index) => (
          <div key={width} className="flex items-center gap-3">
            <Shape animated={animated} breathe={index === 0} className="size-9 shrink-0 rounded-md" />

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Shape animated={animated} className={cn("h-3", width)} motionPhase={1} />

              <Shape animated={animated} className="h-2.5 w-1/4" motionPhase={2} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function MapWidgetSkeleton({ animated = true }: Props) {
  return (
    <div
      aria-hidden="true"
      className="flex h-full min-h-0 flex-col gap-2"
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
      data-skeleton-kind="map-widget"
    >
      <Shape breathe animated={animated} className="min-h-0 w-full flex-1 rounded-lg" />

      <div className="flex gap-3">
        {["w-16", "w-12", "w-20"].map((width, index) => (
          <Shape key={width} animated={animated} className={cn("h-2.5", width)} motionPhase={index < 2 ? 1 : 2} />
        ))}
      </div>
    </div>
  );
}
