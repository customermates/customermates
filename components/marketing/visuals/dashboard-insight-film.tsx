import { MousePointer2 } from "lucide-react";

import { DASHBOARD_INSIGHT_FILM_COPY } from "./dashboard-insight-film.copy";
import type { VisualStatusFixtureId } from "./native-fixtures";
import { NativeStatusBadge } from "./native-visual-primitives";

import { cn } from "@/core/utils/cn";
import { formattingTagFor, type ContentLocale } from "@/i18n/locale-registry";

export const DASHBOARD_INSIGHT_FILM_CONTRACT = {
  fps: 24,
  posterTime: 0.56,
  resolvedHold: { end: 0.78, start: 0.38 },
  seconds: 9,
  transitionWindows: [
    {
      end: 0.38,
      id: "human-select-won",
      minSimilarity: 0.85,
      progressField: "actionProgress",
      start: 0.03,
    },
    {
      end: 0.94,
      id: "semantic-reset",
      minSimilarity: 0.85,
      progressField: "resetProgress",
      start: 0.78,
    },
  ],
} as const;

export type DashboardInsightFilmBrief = {
  currency: "EUR";
  quantityEncoding: "one-token-per-deal";
  segments: readonly {
    count: number;
    status: VisualStatusFixtureId;
    totalValue: number;
  }[];
  selectedSegment: VisualStatusFixtureId;
  valueDisclosure: "selected-total-only";
  widget: string;
};

export type DashboardInsightFilmState = {
  actionProgress: number;
  compositionOpacity: number;
  cursorOpacity: number;
  cursorProgress: number;
  resetProgress: number;
  resolvedProgress: number;
  selectionProgress: number;
  showOpeningState: boolean;
};

type DashboardInsightPhase = "focal" | "opening" | "resolved";
type DashboardInsightScale = "film" | "preview";
type DashboardStatus = DashboardInsightFilmBrief["segments"][number]["status"];

const STATUS_TOKEN_CLASSES: Record<DashboardStatus, string> = {
  "deal-abandoned": "bg-foreground/30 ring-foreground/10",
  "deal-lost": "bg-destructive ring-destructive/15",
  "deal-open": "bg-warning ring-warning/15",
  "deal-won": "bg-success ring-success/15",
};

function clamp(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function smoothProgress(time: number, start: number, end: number) {
  const progress = clamp((time - start) / (end - start));
  return progress * progress * (3 - 2 * progress);
}

export function dashboardInsightFilmState(time: number): DashboardInsightFilmState {
  const t = clamp(time);
  const resetProgress = smoothProgress(t, 0.78, 0.94);
  const showOpeningState = t >= 0.86;
  const compositionOpacity =
    t < 0.78 ? 1 : t < 0.86 ? 1 - smoothProgress(t, 0.78, 0.86) : smoothProgress(t, 0.86, 0.94);

  if (showOpeningState) {
    return {
      actionProgress: 0,
      compositionOpacity,
      cursorOpacity: 0,
      cursorProgress: 0,
      resetProgress,
      resolvedProgress: 0,
      selectionProgress: 0,
      showOpeningState,
    };
  }

  const cursorOpacity = t < 0.08 ? smoothProgress(t, 0.03, 0.08) : t < 0.29 ? 1 : 1 - smoothProgress(t, 0.29, 0.36);

  return {
    actionProgress: smoothProgress(t, 0.03, 0.38),
    compositionOpacity,
    cursorOpacity,
    cursorProgress: smoothProgress(t, 0.03, 0.22),
    resetProgress,
    resolvedProgress: smoothProgress(t, 0.3, 0.38),
    selectionProgress: smoothProgress(t, 0.16, 0.31),
    showOpeningState,
  };
}

export const DASHBOARD_INSIGHT_KEYFRAME_STATES = {
  focal: {
    actionProgress: 0.7,
    compositionOpacity: 1,
    cursorOpacity: 1,
    cursorProgress: 1,
    resetProgress: 0,
    resolvedProgress: 0.5,
    selectionProgress: 1,
    showOpeningState: false,
  },
  opening: {
    actionProgress: 0,
    compositionOpacity: 1,
    cursorOpacity: 0,
    cursorProgress: 0,
    resetProgress: 0,
    resolvedProgress: 0,
    selectionProgress: 0,
    showOpeningState: true,
  },
  resolved: {
    actionProgress: 1,
    compositionOpacity: 1,
    cursorOpacity: 0,
    cursorProgress: 1,
    resetProgress: 0,
    resolvedProgress: 1,
    selectionProgress: 1,
    showOpeningState: false,
  },
} as const satisfies Record<DashboardInsightPhase, DashboardInsightFilmState>;

export function DashboardInsightArtwork({
  brief,
  locale = "en",
  phase,
  scale,
  state,
}: {
  brief: DashboardInsightFilmBrief;
  locale?: ContentLocale;
  phase?: DashboardInsightPhase;
  scale: DashboardInsightScale;
  state: DashboardInsightFilmState;
}) {
  const selectedSegment = brief.segments.find(({ status }) => status === brief.selectedSegment);
  if (!selectedSegment) throw new Error("Dashboard insight requires its selected fixture-backed Status group");

  const copy = DASHBOARD_INSIGHT_FILM_COPY[locale];
  const selectedTotalValue = new Intl.NumberFormat(formattingTagFor(locale), {
    currency: brief.currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(selectedSegment.totalValue);
  const selectionLabel = `${selectedSegment.count} ${copy.deals} · ${selectedTotalValue} ${copy.totalValue}`;
  const selected = state.selectionProgress >= 0.999;
  const showCursor = phase === "focal" || (!phase && state.cursorOpacity > 0.001);

  return (
    <div
      className={cn("relative w-full rounded-xl border border-border bg-card", scale === "film" ? "p-8" : "p-3")}
      data-dashboard-distribution="discrete-status-groups"
      data-dashboard-phase={phase}
      data-dashboard-quantity-encoding={brief.quantityEncoding}
      data-dashboard-value-disclosure={brief.valueDisclosure}
      style={{ opacity: state.compositionOpacity }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className={cn("font-medium", scale === "film" ? "text-xl" : "text-xs")}>{copy.widget}</span>

        <span className={cn("tracking-wide text-muted-foreground uppercase", scale === "film" ? "text-sm" : "text-xs")}>
          {copy.status}
        </span>
      </div>

      <div className={cn(scale === "film" ? "mt-9 space-y-5" : "mt-4 space-y-2.5")}>
        {brief.segments.map((segment) => {
          const isSelected = selected && segment.status === brief.selectedSegment;
          const isSelectedSubject = segment.status === brief.selectedSegment;
          const selectionProgress = isSelectedSubject ? state.selectionProgress : 0;

          return (
            <div
              key={segment.status}
              className={cn(
                "relative grid items-center rounded-lg border",
                scale === "film"
                  ? "min-h-20 grid-cols-[8rem_minmax(0,1fr)_2rem] gap-5 p-5"
                  : "min-h-10 grid-cols-[5rem_minmax(0,1fr)_1.25rem] gap-2 p-2",
                isSelected ? "border-border-strong bg-background shadow-sm" : "border-transparent bg-background/45",
              )}
              data-dashboard-selected={isSelected ? "true" : "false"}
              data-dashboard-status-group={segment.status}
              data-dashboard-token-count={segment.count}
              style={{
                opacity: isSelectedSubject ? 1 : 1 - 0.5 * state.selectionProgress,
                transform: isSelectedSubject ? `translateY(${-2 * selectionProgress}px)` : undefined,
              }}
            >
              <NativeStatusBadge status={segment.status} />

              <div
                className={cn("flex min-w-0 flex-wrap items-center", scale === "film" ? "gap-2" : "gap-1")}
                data-dashboard-token-group={segment.status}
              >
                {Array.from({ length: segment.count }, (_, index) => (
                  <span
                    key={`${segment.status}-${index}`}
                    aria-hidden="true"
                    className={cn(
                      "shrink-0 rounded-full ring-2",
                      scale === "film" ? "size-4" : "size-2.5",
                      STATUS_TOKEN_CLASSES[segment.status],
                    )}
                    data-dashboard-deal-token={segment.status}
                    data-dashboard-token-index={index + 1}
                    style={{
                      opacity: isSelectedSubject ? 0.55 + 0.45 * selectionProgress : 1 - 0.45 * state.selectionProgress,
                      transform: isSelectedSubject ? `scale(${0.9 + 0.1 * selectionProgress})` : undefined,
                    }}
                  />
                ))}
              </div>

              <span
                className={cn(
                  "text-right font-mono tabular-nums text-muted-foreground",
                  scale === "film" ? "text-base" : "text-xs",
                )}
              >
                {segment.count}
              </span>

              {showCursor && isSelectedSubject ? (
                <MousePointer2
                  className={cn(
                    "absolute text-primary drop-shadow-sm",
                    scale === "film" ? "-right-3 -bottom-4 size-9" : "-right-1 -bottom-2 size-5",
                  )}
                  data-dashboard-cursor="causal-human"
                  fill="currentColor"
                  strokeWidth={1.5}
                  style={{
                    opacity: state.cursorOpacity,
                    transform: `translate(${(1 - state.cursorProgress) * 22}px, ${(1 - state.cursorProgress) * 18}px)`,
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className={cn("border-t border-border", scale === "film" ? "mt-7 min-h-12 pt-5" : "mt-3 min-h-7 pt-2")}>
        {selected ? (
          <div
            className={cn("flex items-center justify-between gap-2", scale === "film" ? "text-lg" : "text-xs")}
            data-dashboard-callout={selectionLabel}
            data-dashboard-total-value={selectedSegment.totalValue}
            style={{ opacity: state.resolvedProgress }}
          >
            <span className="text-muted-foreground">{`${selectedSegment.count} ${copy.deals}`}</span>

            <span className="font-medium">{`${selectedTotalValue} ${copy.total}`}</span>
          </div>
        ) : (
          <span aria-hidden="true" className={cn("block", scale === "film" ? "h-6" : "h-4")} />
        )}
      </div>
    </div>
  );
}

export function DashboardInsightFilm({
  brief,
  locale = "en",
  t,
}: {
  brief: DashboardInsightFilmBrief;
  locale?: ContentLocale;
  t: number;
}) {
  const state = dashboardInsightFilmState(t);
  const copy = DASHBOARD_INSIGHT_FILM_COPY[locale];

  return (
    <div
      aria-label={copy.ariaLabel}
      className="relative isolate h-[920px] w-[1280px] overflow-hidden bg-sidebar text-foreground"
      data-film-action-progress={state.actionProgress.toFixed(4)}
      data-film-composition-opacity={state.compositionOpacity.toFixed(4)}
      data-film-cursor-opacity={state.cursorOpacity.toFixed(4)}
      data-film-cursor-progress={state.cursorProgress.toFixed(4)}
      data-film-opening-state={state.showOpeningState ? "1" : "0"}
      data-film-reset-progress={state.resetProgress.toFixed(4)}
      data-film-resolved-progress={state.resolvedProgress.toFixed(4)}
      data-film-selection-progress={state.selectionProgress.toFixed(4)}
      data-scene-film="dashboard-insight"
      role="img"
    >
      <div
        aria-hidden
        className="absolute -top-1/3 left-1/2 size-3/4 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="absolute inset-[10%_14%] flex items-center justify-center">
        <DashboardInsightArtwork brief={brief} locale={locale} scale="film" state={state} />
      </div>
    </div>
  );
}
