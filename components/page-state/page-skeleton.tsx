import type { ComponentProps } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/core/utils/cn";

export type PageSkeletonSpec =
  | { kind: "data-view"; view: "table" | "cards" | "board" }
  | { kind: "dashboard" | "detail" }
  | { kind: "settings"; view?: "form" | "centered-card" }
  | { kind: "inbox"; view?: "split" | "list" | "transcript" };

type Props = ComponentProps<"div"> & {
  animated?: boolean;
  spec: PageSkeletonSpec;
};

const TABLE_ROWS = Array.from({ length: 7 }, (_, index) => index);
const TABLE_CELLS = Array.from({ length: 4 }, (_, index) => index);
const CARDS = Array.from({ length: 8 }, (_, index) => index);
const BOARD_COLUMNS = Array.from({ length: 3 }, (_, index) => index);
const BOARD_CARDS = Array.from({ length: 3 }, (_, index) => index);
const DASHBOARD_CARDS = Array.from({ length: 4 }, (_, index) => index);
const LIST_ROWS = Array.from({ length: 6 }, (_, index) => index);
const FORM_ROWS = Array.from({ length: 4 }, (_, index) => index);

type ShapeProps = Omit<ComponentProps<typeof Skeleton>, "animated"> & {
  animated: boolean;
};

function Shape({ animated, ...props }: ShapeProps) {
  return <Skeleton animated={false} data-loading-shape={animated || undefined} {...props} />;
}

function TableSkeleton({ animated }: { animated: boolean }) {
  return (
    <div className="flex h-full min-h-[28rem] flex-col overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-[minmax(12rem,2fr)_repeat(3,minmax(7rem,1fr))] gap-4 border-b px-4 py-3">
        {TABLE_CELLS.map((cell) => (
          <Shape key={cell} animated={animated} className="h-3 w-20" />
        ))}
      </div>

      <div className="flex flex-1 flex-col">
        {TABLE_ROWS.map((row) => (
          <div
            key={row}
            className="grid min-h-14 flex-1 grid-cols-[minmax(12rem,2fr)_repeat(3,minmax(7rem,1fr))] items-center gap-4 border-b px-4 last:border-b-0"
          >
            <div className="flex items-center gap-3">
              <Shape animated={animated} className="size-8 shrink-0 rounded-full" />

              <Shape animated={animated} className="h-3 w-28" />
            </div>

            {TABLE_CELLS.slice(1).map((cell) => (
              <Shape key={cell} animated={animated} className="h-3 w-16" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CardsSkeleton({ animated }: { animated: boolean }) {
  return (
    <div className="grid h-full min-h-[28rem] auto-rows-fr grid-cols-1 gap-3 overflow-hidden sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {CARDS.map((card) => (
        <div key={card} className="flex min-h-36 flex-col gap-4 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <Shape animated={animated} className="size-9 rounded-full" />

            <div className="flex flex-1 flex-col gap-2">
              <Shape animated={animated} className="h-3 w-2/3" />

              <Shape animated={animated} className="h-2.5 w-1/2" />
            </div>
          </div>

          <Shape animated={animated} className="h-2.5 w-full" />

          <Shape animated={animated} className="h-2.5 w-4/5" />
        </div>
      ))}
    </div>
  );
}

function BoardSkeleton({ animated }: { animated: boolean }) {
  return (
    <div className="grid h-full min-h-[28rem] grid-cols-[repeat(3,minmax(17rem,1fr))] gap-3 overflow-hidden">
      {BOARD_COLUMNS.map((column) => (
        <div key={column} className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3">
          <div className="flex items-center justify-between">
            <Shape animated={animated} className="h-3 w-24" />

            <Shape animated={animated} className="size-5 rounded-full" />
          </div>

          {BOARD_CARDS.map((card) => (
            <div key={card} className="flex min-h-28 flex-col gap-3 rounded-lg border bg-card p-3">
              <Shape animated={animated} className="h-3 w-3/4" />

              <Shape animated={animated} className="h-2.5 w-full" />

              <Shape animated={animated} className="h-2.5 w-1/2" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function DashboardSkeleton({ animated }: { animated: boolean }) {
  return (
    <div className="grid h-full min-h-[34rem] grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
      {DASHBOARD_CARDS.map((card) => (
        <div key={card} className="flex min-h-64 flex-col gap-5 rounded-lg border bg-card p-5">
          <div className="flex items-center justify-between">
            <Shape animated={animated} className="h-4 w-32" />

            <Shape animated={animated} className="size-7 rounded-full" />
          </div>

          {card === 0 ? (
            <div className="flex flex-1 items-end gap-3 pt-4">
              {[45, 72, 58, 88, 64, 78].map((height, index) => (
                <Shape key={index} animated={animated} className="flex-1" style={{ height: `${height}%` }} />
              ))}
            </div>
          ) : card === 1 ? (
            <div className="flex flex-1 items-center gap-6">
              <Shape
                animated={animated}
                className="aspect-square h-32 rounded-full border-16 border-placeholder bg-transparent"
              />

              <div className="flex flex-1 flex-col gap-4">
                {LIST_ROWS.slice(0, 3).map((row) => (
                  <div key={row} className="flex items-center gap-2">
                    <Shape animated={animated} className="size-3 rounded-full" />

                    <Shape animated={animated} className="h-3 flex-1" />
                  </div>
                ))}
              </div>
            </div>
          ) : card === 2 ? (
            <div className="flex flex-1 flex-col justify-center gap-5">
              {[82, 64, 45, 72].map((width, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Shape animated={animated} className="h-3 w-20" />

                  <Shape animated={animated} className="h-5" style={{ width: `${width}%` }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid flex-1 grid-cols-2 gap-4">
              {FORM_ROWS.map((row) => (
                <div key={row} className="flex flex-col justify-center gap-3 rounded-lg bg-muted/50 p-4">
                  <Shape animated={animated} className="h-3 w-16" />

                  <Shape animated={animated} className="h-7 w-24" />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton({ animated }: { animated: boolean }) {
  return (
    <div className="@container/detail h-full min-h-[34rem] overflow-y-auto @4xl/detail:overflow-y-visible">
      <div className="grid h-full grid-cols-1 gap-px overflow-hidden bg-border @4xl/detail:min-h-0 @4xl/detail:flex-1 @4xl/detail:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] @6xl/detail:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_360px]">
        <div className="flex flex-col gap-4 bg-background p-5">
          <Shape animated={animated} className="h-4 w-28" />

          {FORM_ROWS.map((row) => (
            <div key={row} className="grid grid-cols-[8rem_1fr] gap-5 border-b py-3 last:border-0">
              <Shape animated={animated} className="h-3 w-20" />

              <Shape animated={animated} className="h-3 w-2/3" />
            </div>
          ))}

          <Shape animated={animated} className="mt-2 min-h-32 w-full" />
        </div>

        <div className="flex flex-col gap-4 bg-background p-5">
          <Shape animated={animated} className="h-4 w-20" />

          <Shape animated={animated} className="min-h-48 w-full" />

          <Shape animated={animated} className="h-3 w-2/3" />
        </div>

        <div className="flex flex-col gap-4 bg-background p-5">
          <Shape animated={animated} className="h-4 w-24" />

          {LIST_ROWS.slice(0, 5).map((row) => (
            <div key={row} className="flex gap-3">
              <Shape animated={animated} className="size-7 rounded-full" />

              <div className="flex flex-1 flex-col gap-2">
                <Shape animated={animated} className="h-3 w-3/4" />

                <Shape animated={animated} className="h-2.5 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsSkeleton({ animated }: { animated: boolean }) {
  return (
    <div className="flex size-full min-h-[32rem] max-w-3xl flex-col gap-5">
      {[0, 1].map((card) => (
        <div key={card} className="flex flex-col gap-5 rounded-lg border bg-card p-5 md:p-6">
          <div className="flex flex-col gap-2">
            <Shape animated={animated} className="h-4 w-40" />

            <Shape animated={animated} className="h-3 w-2/3" />
          </div>

          {FORM_ROWS.slice(0, card === 0 ? 3 : 2).map((row) => (
            <div key={row} className="flex flex-col gap-2">
              <Shape animated={animated} className="h-3 w-24" />

              <Shape animated={animated} className="h-9 w-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CenteredCardSkeleton({ animated }: { animated: boolean }) {
  return (
    <div className="flex size-full min-h-[32rem] items-center justify-center px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-lg border bg-card p-6 text-center">
        <Shape animated={animated} className="size-12 rounded-xl" />

        <div className="flex w-full flex-col items-center gap-3">
          <Shape animated={animated} className="h-5 w-1/2" />

          <Shape animated={animated} className="h-3 w-4/5" />

          <Shape animated={animated} className="h-3 w-2/3" />
        </div>

        <Shape animated={animated} className="mt-2 h-9 w-32" />
      </div>
    </div>
  );
}

function InboxListSkeleton({ animated }: { animated: boolean }) {
  return (
    <div className="flex h-full min-h-[34rem] flex-col bg-card">
      {LIST_ROWS.map((row) => (
        <div key={row} className="flex min-h-20 items-center gap-3 border-b px-4">
          <Shape animated={animated} className="size-10 rounded-full" />

          <div className="flex flex-1 flex-col gap-2">
            <Shape animated={animated} className="h-3 w-2/3" />

            <Shape animated={animated} className="h-2.5 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function InboxTranscriptSkeleton({ animated }: { animated: boolean }) {
  return (
    <div className="flex h-full min-h-[34rem] flex-col gap-5 bg-card p-6">
      <div className="flex items-center gap-3 border-b pb-5">
        <Shape animated={animated} className="size-10 rounded-full" />

        <div className="flex flex-1 flex-col gap-2">
          <Shape animated={animated} className="h-4 w-40" />

          <Shape animated={animated} className="h-2.5 w-24" />
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-end gap-4">
        <Shape animated={animated} className="h-16 w-2/3 self-start rounded-xl" />

        <Shape animated={animated} className="h-20 w-3/5 self-end rounded-xl" />

        <Shape animated={animated} className="h-12 w-1/2 self-start rounded-xl" />
      </div>

      <Shape animated={animated} className="h-20 w-full" />
    </div>
  );
}

function InboxSkeleton({ animated, view = "split" }: { animated: boolean; view?: "split" | "list" | "transcript" }) {
  if (view === "list") return <InboxListSkeleton animated={animated} />;
  if (view === "transcript") return <InboxTranscriptSkeleton animated={animated} />;

  return (
    <div className="grid h-full min-h-[34rem] grid-cols-1 overflow-hidden rounded-lg border bg-card lg:grid-cols-[380px_1fr]">
      <div className="border-r">
        <InboxListSkeleton animated={animated} />
      </div>

      <div className="hidden lg:block">
        <InboxTranscriptSkeleton animated={animated} />
      </div>
    </div>
  );
}

export function PageSkeleton({ animated = true, className, spec, ...props }: Props) {
  const content =
    spec.kind === "data-view" ? (
      spec.view === "table" ? (
        <TableSkeleton animated={animated} />
      ) : spec.view === "cards" ? (
        <CardsSkeleton animated={animated} />
      ) : (
        <BoardSkeleton animated={animated} />
      )
    ) : spec.kind === "dashboard" ? (
      <DashboardSkeleton animated={animated} />
    ) : spec.kind === "detail" ? (
      <DetailSkeleton animated={animated} />
    ) : spec.kind === "settings" ? (
      spec.view === "centered-card" ? (
        <CenteredCardSkeleton animated={animated} />
      ) : (
        <SettingsSkeleton animated={animated} />
      )
    ) : (
      <InboxSkeleton animated={animated} view={spec.kind === "inbox" ? spec.view : undefined} />
    );

  return (
    <div
      aria-hidden="true"
      className={cn("size-full min-h-0", animated && "animate-pulse motion-reduce:animate-none", className)}
      data-skeleton-kind={spec.kind}
      data-skeleton-view={spec.kind === "data-view" || spec.kind === "inbox" ? spec.view : undefined}
      {...props}
    >
      {content}
    </div>
  );
}
