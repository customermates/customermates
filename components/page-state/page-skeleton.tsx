import type { ComponentProps } from "react";

import {
  DATA_CARD_GRID_CLASS_NAME,
  DATA_KANBAN_CARDS_CLASS_NAME,
  DATA_KANBAN_COLUMN_CLASS_NAME,
  DATA_KANBAN_HEADER_CLASS_NAME,
  DATA_KANBAN_ROOT_CLASS_NAME,
  DATA_KANBAN_TRACK_CLASS_NAME,
  DATA_VIEW_PAGINATION_RAIL_CLASS_NAME,
} from "@/components/data-view/data-view-geometry";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/core/utils/cn";

import { SETTINGS_CARD_GRID_CLASS_NAME } from "./page-state-geometry";

export type PageSkeletonSpec =
  | { kind: "data-view"; view: "table"; tableVariant: "contact" | "entity" | "member" | "plain" }
  | { identity: "avatar" | "text"; kind: "data-view"; view: "cards" | "board" }
  | { kind: "dashboard" }
  | { kind: "detail" }
  | { kind: "settings"; view?: "form" }
  | { card: "api-keys" | "connected-accounts"; kind: "settings"; view: "cards" }
  | { kind: "settings"; view: "centered-card"; maxWidth?: "2xl" | "3xl" }
  | { kind: "inbox"; view?: "split" | "list" | "transcript" };

type Props = ComponentProps<"div"> & {
  animated?: boolean;
  spec: PageSkeletonSpec;
};

const TABLE_ROWS = Array.from({ length: 18 }, (_, index) => index);
const TABLE_HEADERS = Array.from({ length: 4 }, (_, index) => index);
const TABLE_COLUMNS = Array.from({ length: 3 }, (_, index) => index);
const CARDS = Array.from({ length: 8 }, (_, index) => index);
const CARD_ROWS = Array.from({ length: 4 }, (_, index) => index);
const BOARD_COLUMNS = Array.from({ length: 3 }, (_, index) => index);
const BOARD_CARDS = Array.from({ length: 3 }, (_, index) => index);
const DASHBOARD_CARDS = Array.from({ length: 4 }, (_, index) => index);
const TIMELINE_ROWS = Array.from({ length: 6 }, (_, index) => index);
const INBOX_ROWS = Array.from({ length: 10 }, (_, index) => index);
const FORM_ROWS = Array.from({ length: 5 }, (_, index) => index);
const SETTINGS_CARD_ROWS = Array.from({ length: 5 }, (_, index) => index);

type ShapeProps = Omit<ComponentProps<typeof Skeleton>, "animated"> & {
  animated: boolean;
};

function Shape({ animated, ...props }: ShapeProps) {
  return <Skeleton animated={false} data-loading-shape={animated || undefined} {...props} />;
}

function FormFieldSkeleton({ animated, short = false }: { animated: boolean; short?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Shape animated={animated} className={cn("h-3", short ? "w-20" : "w-28")} />

      <Shape animated={animated} className="h-9 w-full rounded-md" />
    </div>
  );
}

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

        <Shape animated={animated} className="h-3 w-2/3" />
      </div>

      {CARD_ROWS.slice(0, rows).map((row) => (
        <div key={row} className="flex h-5 items-center justify-between gap-3">
          <Shape animated={animated} className="h-2.5 w-16 shrink-0" />

          <Shape animated={animated} className="h-3 w-20 max-w-[50%]" />
        </div>
      ))}
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
              <Shape animated={animated} className={cn("h-2.5", cell === 0 ? "w-20" : "w-16")} />
            </div>
          ))}
        </div>

        {TABLE_ROWS.map((row) => (
          <div key={row} className={cn("grid items-center border-b last:border-b-0", columns, rowHeight)}>
            {hasSelection && (
              <div className="px-3">
                <Shape animated={animated} className="size-4 rounded-[4px]" />
              </div>
            )}

            <div className="flex items-center gap-2 px-3">
              {hasIdentity && <Shape animated={animated} className="size-6 shrink-0 rounded-md" />}

              <div className={cn("flex min-w-0 flex-1 flex-col", variant === "member" && "gap-1")}>
                <Shape animated={animated} className="h-3 w-28" />

                {variant === "member" && <Shape animated={animated} className="h-2.5 w-36" />}
              </div>
            </div>

            {TABLE_COLUMNS.map((cell) => (
              <div key={cell} className="px-3">
                <Shape animated={animated} className={cn("h-3", cell === 1 ? "w-20" : "w-16")} />
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
          <div key={card} className="relative flex flex-col gap-3 rounded-xl bg-card py-4 shadow-xs">
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
          <div key={column} className={DATA_KANBAN_COLUMN_CLASS_NAME}>
            <div className={DATA_KANBAN_HEADER_CLASS_NAME}>
              <Shape animated={animated} className="h-6 w-28 rounded-full" />
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
    <div data-skeleton-pagination className={DATA_VIEW_PAGINATION_RAIL_CLASS_NAME}>
      <Shape animated={animated} className="h-3 w-32" />

      <div className="flex items-center gap-0.5">
        <Shape animated={animated} className="h-8 w-14 rounded-md" />

        <Shape animated={animated} className="size-8 rounded-md" />

        <Shape animated={animated} className="size-8 rounded-md" />
      </div>
    </div>
  );
}

type DataViewSkeletonSpec = Extract<PageSkeletonSpec, { kind: "data-view" }>;

function DataViewSkeleton({ animated, spec }: { animated: boolean; spec: DataViewSkeletonSpec }) {
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

function DashboardSkeleton({ animated }: { animated: boolean }) {
  return (
    <div className="grid min-h-[34rem] grid-cols-1 gap-4 md:grid-cols-2">
      {DASHBOARD_CARDS.map((card) => (
        <div key={card} className="flex h-[264px] flex-col gap-0 rounded-xl bg-card py-0 shadow-xs">
          <div className="flex w-full shrink-0 flex-col items-start gap-0.5 p-6 pb-0">
            <Shape animated={animated} className="h-4 w-32" />

            <Shape animated={animated} className="h-2.5 w-20" />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
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
                  className="size-32 shrink-0 rounded-full border-[16px] border-placeholder bg-transparent"
                />

                <div className="flex flex-1 flex-col gap-4">
                  {TIMELINE_ROWS.slice(0, 3).map((row) => (
                    <div key={row} className="flex items-center gap-2">
                      <Shape animated={animated} className="size-3 rounded-full" />

                      <Shape animated={animated} className="h-3 flex-1" />
                    </div>
                  ))}
                </div>
              </div>
            ) : card === 2 ? (
              <div className="flex flex-1 flex-col justify-center gap-4">
                {[82, 64, 45, 72].map((width, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <Shape animated={animated} className="h-3 w-20 shrink-0" />

                    <Shape animated={animated} className="h-5" style={{ width: `${width}%` }} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid flex-1 grid-cols-2 gap-4">
                {CARD_ROWS.map((row) => (
                  <div key={row} className="flex flex-col justify-center gap-3 rounded-lg bg-muted/50 p-4">
                    <Shape animated={animated} className="h-3 w-16" />

                    <Shape animated={animated} className="h-7 w-24" />
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

function DetailSectionHeader({
  animated,
  labelWidth,
  timeline = false,
  master = false,
}: {
  animated: boolean;
  labelWidth: string;
  timeline?: boolean;
  master?: boolean;
}) {
  return (
    <div
      className={cn("flex shrink-0 items-center gap-2 px-4 pt-4", timeline ? "pb-2" : "pb-1", master && "min-h-8 pt-3")}
    >
      <Shape animated={animated} className="size-3.5 rounded" />

      <Shape animated={animated} className={cn("h-2.5", labelWidth)} />
    </div>
  );
}

function DetailSkeleton({ animated }: { animated: boolean }) {
  return (
    <div className="@container/detail flex h-full min-h-0 flex-col overflow-y-auto @4xl/detail:overflow-y-visible">
      <div className="grid grid-cols-1 gap-px bg-border contain-[layout] @4xl/detail:min-h-0 @4xl/detail:flex-1 @4xl/detail:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] @6xl/detail:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_360px]">
        <div className="flex flex-col bg-background @4xl/detail:min-h-0 @4xl/detail:overflow-auto">
          <DetailSectionHeader master animated={animated} labelWidth="w-20" />

          <div className="p-4 pt-2 @4xl/detail:min-h-0 @4xl/detail:flex-1">
            <div className="flex w-full flex-col gap-4">
              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                <FormFieldSkeleton short animated={animated} />

                <FormFieldSkeleton short animated={animated} />
              </div>

              {FORM_ROWS.slice(0, 4).map((row) => (
                <FormFieldSkeleton key={row} animated={animated} short={row % 2 === 0} />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-px bg-border @4xl/detail:min-h-0 @6xl/detail:contents">
          <div className="flex flex-col bg-background @4xl/detail:min-h-0 @4xl/detail:flex-2 @4xl/detail:overflow-hidden">
            <DetailSectionHeader animated={animated} labelWidth="w-16" />

            <div className="min-h-0 flex-1 overflow-auto p-4 pt-2">
              <Shape animated={animated} className="min-h-52 w-full" />
            </div>
          </div>

          <div className="flex flex-col bg-background @4xl/detail:min-h-0 @4xl/detail:flex-1 @4xl/detail:overflow-hidden">
            <DetailSectionHeader timeline animated={animated} labelWidth="w-20" />

            <div className="min-h-0 flex-1 overflow-auto px-2 pt-2 pb-4">
              {TIMELINE_ROWS.map((row) => (
                <div key={row} className="flex items-start gap-3 rounded-md p-2">
                  <Shape animated={animated} className="size-8 shrink-0 rounded-lg" />

                  <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <Shape animated={animated} className="h-3 w-3/5" />

                      <Shape animated={animated} className="h-2.5 w-12" />
                    </div>

                    <Shape animated={animated} className="h-2.5 w-4/5" />
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

function SettingsFormSkeleton({ animated }: { animated: boolean }) {
  return (
    <div className="flex size-full min-h-[32rem] max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          <FormFieldSkeleton short animated={animated} />

          <FormFieldSkeleton short animated={animated} />
        </div>

        {FORM_ROWS.map((row) => (
          <FormFieldSkeleton key={row} animated={animated} short={row % 2 === 0} />
        ))}
      </div>
    </div>
  );
}

function SettingsCardBodySkeleton({ animated, card }: { animated: boolean; card: "api-keys" | "connected-accounts" }) {
  const rows = card === "connected-accounts" ? 5 : 3;

  return (
    <div className="flex flex-col gap-2 px-4">
      <div className="flex h-5 items-center gap-2">
        {card === "connected-accounts" && <Shape animated={animated} className="size-4 shrink-0 rounded" />}

        <Shape animated={animated} className="h-3 w-2/3" />
      </div>

      {SETTINGS_CARD_ROWS.slice(0, rows).map((row) => (
        <div key={row} className="flex h-5 items-center justify-between gap-3">
          <Shape animated={animated} className="h-2.5 w-20 shrink-0" />

          <Shape animated={animated} className="h-3 w-24 max-w-[50%]" />
        </div>
      ))}
    </div>
  );
}

function SettingsCardsSkeleton({ animated, card }: { animated: boolean; card: "api-keys" | "connected-accounts" }) {
  return (
    <div className="flex size-full min-h-[32rem] max-w-3xl flex-col gap-4">
      <div className="grid w-full grid-cols-[1rem_1fr] items-start gap-x-3 gap-y-0.5 rounded-lg border px-4 py-3">
        <Shape animated={animated} className="size-4" />

        <Shape animated={animated} className="mt-0.5 h-3 w-4/5" />
      </div>

      <div className={SETTINGS_CARD_GRID_CLASS_NAME}>
        {CARDS.slice(0, 4).map((item) => (
          <div key={item} className="flex flex-col gap-3 rounded-xl bg-card py-4 shadow-xs">
            <SettingsCardBodySkeleton animated={animated} card={card} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CenteredCardSkeleton({ animated, maxWidth = "2xl" }: { animated: boolean; maxWidth?: "2xl" | "3xl" }) {
  return (
    <div className="relative size-full min-h-0 overflow-y-auto">
      <div className="flex min-h-full w-full items-center justify-center p-4">
        <div
          className={cn(
            "flex w-full flex-col gap-0 rounded-xl bg-card py-0 shadow-xs",
            maxWidth === "3xl" ? "max-w-3xl" : "max-w-2xl",
          )}
        >
          <div className="flex flex-col items-center gap-5 p-6 text-center">
            <Shape animated={animated} className="size-12 rounded-xl" />

            <div className="flex w-full flex-col items-center gap-3">
              <Shape animated={animated} className="h-5 w-1/2" />

              <Shape animated={animated} className="h-3 w-4/5" />

              <Shape animated={animated} className="h-3 w-2/3" />
            </div>
          </div>

          <div className="flex w-full items-center justify-end gap-4 p-6 pt-0">
            <Shape animated={animated} className="h-9 w-32 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

function InboxListSkeleton({ animated }: { animated: boolean }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto" data-skeleton-scroll-owner="inbox-list">
      {INBOX_ROWS.map((row) => (
        <div key={row} className="flex min-h-16 items-center gap-3 border-b p-3 last:border-b-0">
          <Shape animated={animated} className="size-8 shrink-0 rounded-lg" />

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <Shape animated={animated} className="h-3 w-2/5" />

              <Shape animated={animated} className="h-2.5 w-12" />
            </div>

            <Shape animated={animated} className="mt-0.5 h-2.5 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MessageSkeleton({
  animated,
  outbound = false,
  height,
}: {
  animated: boolean;
  outbound?: boolean;
  height: string;
}) {
  return (
    <div className={cn("flex gap-2 px-4 py-2", outbound && "flex-row-reverse")}>
      <Shape animated={animated} className="size-8 shrink-0 self-end rounded-lg" />

      <Shape
        animated={animated}
        className={cn(
          "max-w-[80%] rounded-xl shadow-xs",
          outbound ? "w-3/5 rounded-br-md" : "w-2/3 rounded-bl-md",
          height,
        )}
      />
    </div>
  );
}

function InboxTranscriptSkeleton({ animated }: { animated: boolean }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div
        className="flex flex-1 flex-col justify-end gap-1 overflow-y-auto py-3"
        data-skeleton-scroll-owner="transcript"
      >
        <MessageSkeleton animated={animated} height="h-16" />

        <MessageSkeleton outbound animated={animated} height="h-20" />

        <MessageSkeleton animated={animated} height="h-12" />
      </div>

      <div className="shrink-0 bg-background px-4 pt-2 pb-4">
        <div className="flex min-h-[6rem] flex-col justify-between rounded-xl bg-card p-3 shadow-xs">
          <Shape animated={animated} className="h-3 w-2/3" />

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Shape animated={animated} className="size-8 rounded-md" />

              <Shape animated={animated} className="size-8 rounded-md" />
            </div>

            <Shape animated={animated} className="h-8 w-20 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

function InboxSkeleton({ animated, view = "split" }: { animated: boolean; view?: "split" | "list" | "transcript" }) {
  if (view === "list") return <InboxListSkeleton animated={animated} />;
  if (view === "transcript") return <InboxTranscriptSkeleton animated={animated} />;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 lg:grid lg:grid-cols-[380px_1fr]">
      <div className="min-h-0 min-w-0 flex-1 lg:border-r lg:border-border">
        <InboxListSkeleton animated={animated} />
      </div>

      <div className="hidden min-h-0 min-w-0 flex-1 lg:block">
        <InboxTranscriptSkeleton animated={animated} />
      </div>
    </div>
  );
}

export function PageSkeleton({ animated = true, className, spec, ...props }: Props) {
  const content =
    spec.kind === "data-view" ? (
      <DataViewSkeleton animated={animated} spec={spec} />
    ) : spec.kind === "dashboard" ? (
      <DashboardSkeleton animated={animated} />
    ) : spec.kind === "detail" ? (
      <DetailSkeleton animated={animated} />
    ) : spec.kind === "settings" ? (
      spec.view === "centered-card" ? (
        <CenteredCardSkeleton animated={animated} maxWidth={spec.maxWidth} />
      ) : spec.view === "cards" ? (
        <SettingsCardsSkeleton animated={animated} card={spec.card} />
      ) : (
        <SettingsFormSkeleton animated={animated} />
      )
    ) : (
      <InboxSkeleton animated={animated} view={spec.view} />
    );

  return (
    <div
      aria-hidden="true"
      className={cn("size-full min-h-0", animated && "animate-pulse motion-reduce:animate-none", className)}
      data-skeleton-kind={spec.kind}
      data-skeleton-variant={
        spec.kind === "data-view"
          ? spec.view === "table"
            ? spec.tableVariant
            : spec.identity
          : spec.kind === "settings" && spec.view === "cards"
            ? spec.card
            : undefined
      }
      data-skeleton-view={
        spec.kind === "data-view" || spec.kind === "inbox" || spec.kind === "settings" ? spec.view : undefined
      }
      {...props}
    >
      {content}
    </div>
  );
}
