import {
  DATA_CARD_GRID_CLASS_NAME,
  DATA_KANBAN_CARDS_CLASS_NAME,
  DATA_KANBAN_COLUMN_CLASS_NAME,
  DATA_KANBAN_HEADER_CLASS_NAME,
  DATA_KANBAN_ROOT_CLASS_NAME,
  DATA_KANBAN_TRACK_CLASS_NAME,
  DATA_VIEW_PAGINATION_RAIL_CLASS_NAME,
} from "@/components/data-view/data-view-geometry";
import { SkeletonShape as Shape, type SkeletonMotionPhase } from "@/components/page-state/skeleton-shape";
import { cn } from "@/core/utils/cn";

export type DataViewSkeletonSpec =
  | {
      view: "table";
      tableVariant: "contact" | "entity" | "member" | "plain";
    }
  | { identity: "avatar" | "text"; view: "cards" | "board" };

type Props = {
  animated?: boolean;
  spec: DataViewSkeletonSpec;
};

const TABLE_ROWS = Array.from({ length: 18 }, (_, index) => index);
const TABLE_HEADERS = Array.from({ length: 4 }, (_, index) => index);
const TABLE_COLUMNS = Array.from({ length: 3 }, (_, index) => index);
const CARDS = Array.from({ length: 8 }, (_, index) => index);
const CARD_ROWS = Array.from({ length: 4 }, (_, index) => index);
const BOARD_COLUMNS = Array.from({ length: 3 }, (_, index) => index);
const BOARD_CARDS = Array.from({ length: 3 }, (_, index) => index);

function CardBodySkeleton({
  animated,
  identity,
  rows = 4,
}: {
  animated: boolean;
  identity: "avatar" | "text";
  rows?: number;
}) {
  return (
    <div className="space-y-2">
      <div className={cn("flex items-center gap-2", identity === "avatar" ? "h-6" : "h-5")}>
        {identity === "avatar" && <Shape animated={animated} className="size-6 shrink-0 rounded-md" />}

        <Shape breathe animated={animated} className="h-3 w-2/3" motionPhase={1} />
      </div>

      {CARD_ROWS.slice(0, rows).map((row) => {
        const motionPhase = Math.min(row + 2, 3) as SkeletonMotionPhase;
        return (
          <div key={row} className="flex h-5 items-center justify-between gap-3">
            <Shape animated={animated} className="h-2.5 w-16 shrink-0" motionPhase={motionPhase} />

            <Shape animated={animated} className="h-3 w-20 max-w-[50%]" motionPhase={motionPhase} />
          </div>
        );
      })}
    </div>
  );
}

function TableSkeleton({
  animated,
  variant,
}: {
  animated: boolean;
  variant: "contact" | "entity" | "member" | "plain";
}) {
  const hasSelection = variant === "contact" || variant === "entity";
  const hasIdentity = variant === "contact" || variant === "member";
  const rowHeight = variant === "member" ? "h-[3.25rem]" : "h-10";
  const columns = hasSelection
    ? "grid-cols-[2.5rem_minmax(12rem,2fr)_repeat(3,minmax(7rem,1fr))]"
    : "grid-cols-[minmax(12rem,2fr)_repeat(3,minmax(7rem,1fr))]";

  return (
    <div className="h-full min-h-0 overflow-auto" data-skeleton-scroll-owner="table">
      <div className="min-w-[48rem]">
        <div className={cn("grid h-8 items-center border-b", columns)}>
          {hasSelection && (
            <div className="px-3">
              <Shape animated={animated} className="size-4 rounded-[4px]" />
            </div>
          )}

          {TABLE_HEADERS.map((cell) => (
            <div key={cell} className="px-3">
              <Shape animated={animated} breathe={cell === 0} className={cn("h-2.5", cell === 0 ? "w-20" : "w-16")} />
            </div>
          ))}
        </div>

        {TABLE_ROWS.map((row) => (
          <div
            key={row}
            className={cn("grid items-center border-b last:border-b-0", columns, rowHeight)}
            data-skeleton-group={row % 4}
          >
            {hasSelection && (
              <div className="px-3">
                <Shape animated={animated} className="size-4 rounded-[4px]" />
              </div>
            )}

            <div className="flex items-center gap-2 px-3">
              {hasIdentity && <Shape animated={animated} className="size-6 shrink-0 rounded-md" motionPhase={1} />}

              <div className={cn("flex min-w-0 flex-1 flex-col", variant === "member" && "gap-1")}>
                <Shape breathe animated={animated} className="h-3 w-28" motionPhase={1} />

                {variant === "member" && <Shape animated={animated} className="h-2.5 w-36" motionPhase={2} />}
              </div>
            </div>

            {TABLE_COLUMNS.map((cell) => (
              <div key={cell} className="px-3">
                <Shape
                  animated={animated}
                  className={cn("h-3", cell === 1 ? "w-20" : "w-16")}
                  motionPhase={cell < 2 ? 2 : 3}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CardsSkeleton({ animated, identity }: { animated: boolean; identity: "avatar" | "text" }) {
  return (
    <div className="h-full min-h-0 overflow-y-auto" data-skeleton-scroll-owner="cards">
      <div className={DATA_CARD_GRID_CLASS_NAME}>
        {CARDS.map((card) => (
          <div
            key={card}
            className="relative flex flex-col gap-3 rounded-xl bg-card py-4 shadow-xs"
            data-skeleton-group={card % 4}
          >
            <div className="px-4">
              <CardBodySkeleton animated={animated} identity={identity} rows={card % 3 === 0 ? 3 : 4} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BoardSkeleton({ animated, identity }: { animated: boolean; identity: "avatar" | "text" }) {
  return (
    <div
      className={cn(DATA_KANBAN_ROOT_CLASS_NAME, "h-full")}
      data-skeleton-scroll-owner="board"
      data-slot="kanban-root"
    >
      <div className={DATA_KANBAN_TRACK_CLASS_NAME}>
        {BOARD_COLUMNS.map((column) => (
          <div key={column} className={DATA_KANBAN_COLUMN_CLASS_NAME} data-skeleton-group={column % 4}>
            <div className={DATA_KANBAN_HEADER_CLASS_NAME}>
              <Shape breathe animated={animated} className="h-6 w-28 rounded-full" motionPhase={1} />
            </div>

            <div className={DATA_KANBAN_CARDS_CLASS_NAME}>
              {BOARD_CARDS.map((card) => (
                <div key={card} className="flex flex-col gap-2 rounded-xl bg-card py-3 shadow-xs">
                  <div className="px-3">
                    <CardBodySkeleton animated={animated} identity={identity} rows={card === 0 ? 4 : 3} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaginationSkeleton({ animated }: { animated: boolean }) {
  return (
    <div data-skeleton-pagination className={DATA_VIEW_PAGINATION_RAIL_CLASS_NAME} data-skeleton-group="3">
      <Shape breathe animated={animated} className="h-3 w-32" />

      <div className="flex items-center gap-0.5">
        <Shape animated={animated} className="h-8 w-14 rounded-md" motionPhase={1} />

        <Shape animated={animated} className="size-8 rounded-md" motionPhase={2} />

        <Shape animated={animated} className="size-8 rounded-md" motionPhase={3} />

        <Shape animated={animated} className="size-8 rounded-md" motionPhase={3} />
      </div>
    </div>
  );
}

export function DataViewSkeleton({ animated = true, spec }: Props) {
  return (
    <div className="flex size-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        {spec.view === "table" ? (
          <TableSkeleton animated={animated} variant={spec.tableVariant} />
        ) : spec.view === "cards" ? (
          <CardsSkeleton animated={animated} identity={spec.identity} />
        ) : (
          <BoardSkeleton animated={animated} identity={spec.identity} />
        )}
      </div>

      {animated && spec.view !== "board" && <PaginationSkeleton animated={animated} />}
    </div>
  );
}
