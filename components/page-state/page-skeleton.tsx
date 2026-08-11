import type { ComponentProps } from "react";

import { DataViewSkeleton, type DataViewSkeletonSpec } from "@/components/data-view/data-view-skeleton";
import { cn } from "@/core/utils/cn";

import { SETTINGS_CARD_GRID_CLASS_NAME } from "./page-state-geometry";
import { SkeletonShape as Shape, type SkeletonMotionPhase } from "./skeleton-shape";

export type PageSkeletonSpec =
  | ({ kind: "data-view" } & DataViewSkeletonSpec)
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

const CARDS = Array.from({ length: 8 }, (_, index) => index);
const CARD_ROWS = Array.from({ length: 4 }, (_, index) => index);
const DASHBOARD_CARDS = Array.from({ length: 4 }, (_, index) => index);
const TIMELINE_ROWS = Array.from({ length: 6 }, (_, index) => index);
const INBOX_ROWS = Array.from({ length: 10 }, (_, index) => index);
const FORM_ROWS = Array.from({ length: 5 }, (_, index) => index);
const SETTINGS_CARD_ROWS = Array.from({ length: 5 }, (_, index) => index);

function FormFieldSkeleton({ animated, short = false }: { animated: boolean; short?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Shape breathe animated={animated} className={cn("h-3", short ? "w-20" : "w-28")} />

      <Shape animated={animated} className="h-9 w-full rounded-md" motionPhase={1} />
    </div>
  );
}

function DashboardSkeleton({ animated }: { animated: boolean }) {
  return (
    <div className="grid min-h-[34rem] grid-cols-1 gap-4 md:grid-cols-2">
      {DASHBOARD_CARDS.map((card) => (
        <div
          key={card}
          className="flex h-[264px] flex-col gap-0 rounded-xl bg-card py-0 shadow-xs"
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
                  {TIMELINE_ROWS.slice(0, 3).map((row) => (
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
                {CARD_ROWS.map((row) => (
                  <div key={row} className="flex flex-col justify-center gap-3 rounded-lg bg-muted/50 p-4">
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

      <Shape breathe animated={animated} className={cn("h-2.5", labelWidth)} motionPhase={1} />
    </div>
  );
}

function DetailSkeleton({ animated }: { animated: boolean }) {
  return (
    <div className="@container/detail flex h-full min-h-0 flex-col overflow-y-auto @4xl/detail:overflow-y-visible">
      <div className="grid grid-cols-1 gap-px bg-border contain-[layout] @4xl/detail:min-h-0 @4xl/detail:flex-1 @4xl/detail:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] @6xl/detail:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_360px]">
        <div
          className="flex flex-col bg-background @4xl/detail:min-h-0 @4xl/detail:overflow-auto"
          data-skeleton-group="0"
        >
          <DetailSectionHeader master animated={animated} labelWidth="w-20" />

          <div className="p-4 pt-2 @4xl/detail:min-h-0 @4xl/detail:flex-1">
            <div className="flex w-full flex-col gap-4">
              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                <div data-skeleton-group="1">
                  <FormFieldSkeleton short animated={animated} />
                </div>

                <FormFieldSkeleton short animated={animated} />
              </div>

              {FORM_ROWS.slice(0, 4).map((row) => (
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
            <DetailSectionHeader animated={animated} labelWidth="w-16" />

            <div className="min-h-0 flex-1 overflow-auto p-4 pt-2">
              <Shape animated={animated} className="min-h-52 w-full" motionPhase={2} />
            </div>
          </div>

          <div
            className="flex flex-col bg-background @4xl/detail:min-h-0 @4xl/detail:flex-1 @4xl/detail:overflow-hidden"
            data-skeleton-group="2"
          >
            <DetailSectionHeader timeline animated={animated} labelWidth="w-20" />

            <div className="min-h-0 flex-1 overflow-auto px-2 pt-2 pb-4">
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

function SettingsFormSkeleton({ animated }: { animated: boolean }) {
  return (
    <div className="flex size-full min-h-[32rem] max-w-3xl flex-col gap-6">
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
    </div>
  );
}

function SettingsCardBodySkeleton({ animated, card }: { animated: boolean; card: "api-keys" | "connected-accounts" }) {
  const rows = card === "connected-accounts" ? 5 : 3;

  return (
    <div className="flex flex-col gap-2 px-4">
      <div className="flex h-5 items-center gap-2">
        {card === "connected-accounts" && <Shape animated={animated} className="size-4 shrink-0 rounded" />}

        <Shape breathe animated={animated} className="h-3 w-2/3" motionPhase={1} />
      </div>

      {SETTINGS_CARD_ROWS.slice(0, rows).map((row) => {
        const motionPhase = Math.min(row + 2, 3) as SkeletonMotionPhase;
        return (
          <div key={row} className="flex h-5 items-center justify-between gap-3">
            <Shape animated={animated} className="h-2.5 w-20 shrink-0" motionPhase={motionPhase} />

            <Shape animated={animated} className="h-3 w-24 max-w-[50%]" motionPhase={motionPhase} />
          </div>
        );
      })}
    </div>
  );
}

function SettingsCardsSkeleton({ animated, card }: { animated: boolean; card: "api-keys" | "connected-accounts" }) {
  return (
    <div className="flex size-full min-h-[32rem] max-w-3xl flex-col gap-4">
      <div
        className="grid w-full grid-cols-[1rem_1fr] items-start gap-x-3 gap-y-0.5 rounded-lg border px-4 py-3"
        data-skeleton-group="0"
      >
        <Shape animated={animated} className="size-4" />

        <Shape breathe animated={animated} className="mt-0.5 h-3 w-4/5" motionPhase={1} />
      </div>

      <div className={SETTINGS_CARD_GRID_CLASS_NAME}>
        {CARDS.slice(0, 4).map((item) => (
          <div
            key={item}
            className="flex flex-col gap-3 rounded-xl bg-card py-4 shadow-xs"
            data-skeleton-group={item % 4}
          >
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
          data-skeleton-group="0"
        >
          <div className="flex flex-col items-center gap-5 p-6 text-center">
            <Shape animated={animated} className="size-12 rounded-xl" />

            <div className="flex w-full flex-col items-center gap-3">
              <Shape breathe animated={animated} className="h-5 w-1/2" motionPhase={1} />

              <Shape animated={animated} className="h-3 w-4/5" motionPhase={2} />

              <Shape animated={animated} className="h-3 w-2/3" motionPhase={2} />
            </div>
          </div>

          <div className="flex w-full items-center justify-end gap-4 p-6 pt-0">
            <Shape animated={animated} className="h-9 w-32 rounded-md" motionPhase={3} />
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
        <div
          key={row}
          className="flex min-h-16 items-center gap-3 border-b p-3 last:border-b-0"
          data-skeleton-group={row % 4}
        >
          <Shape animated={animated} className="size-8 shrink-0 rounded-lg" />

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <Shape breathe animated={animated} className="h-3 w-2/5" motionPhase={1} />

              <Shape animated={animated} className="h-2.5 w-12" motionPhase={2} />
            </div>

            <Shape animated={animated} className="mt-0.5 h-2.5 w-4/5" motionPhase={3} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MessageSkeleton({
  animated,
  group,
  outbound = false,
  height,
}: {
  animated: boolean;
  group: SkeletonMotionPhase;
  outbound?: boolean;
  height: string;
}) {
  return (
    <div className={cn("flex gap-2 px-4 py-2", outbound && "flex-row-reverse")} data-skeleton-group={group}>
      <Shape animated={animated} className="size-8 shrink-0 self-end rounded-lg" />

      <Shape
        breathe
        animated={animated}
        className={cn(
          "max-w-[80%] rounded-xl shadow-xs",
          outbound ? "w-3/5 rounded-br-md" : "w-2/3 rounded-bl-md",
          height,
        )}
        motionPhase={1}
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
        <MessageSkeleton animated={animated} group={0} height="h-16" />

        <MessageSkeleton outbound animated={animated} group={1} height="h-20" />

        <MessageSkeleton animated={animated} group={2} height="h-12" />
      </div>

      <div className="shrink-0 bg-background px-4 pt-2 pb-4">
        <div
          className="flex min-h-[6rem] flex-col justify-between rounded-xl bg-card p-3 shadow-xs"
          data-skeleton-group="3"
        >
          <Shape breathe animated={animated} className="h-3 w-2/3" />

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Shape animated={animated} className="size-8 rounded-md" motionPhase={1} />

              <Shape animated={animated} className="size-8 rounded-md" motionPhase={2} />
            </div>

            <Shape animated={animated} className="h-8 w-20 rounded-md" motionPhase={3} />
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
      className={cn("size-full min-h-0", className)}
      data-page-skeleton-empty={!animated || undefined}
      data-page-skeleton-loading={animated || undefined}
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
