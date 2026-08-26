import type { CSSProperties } from "react";

import { Check } from "lucide-react";

import { AGENT_PIPELINE_FILM_COPY } from "./agent-pipeline-film.copy";
import {
  VISUAL_RECORD_FIXTURES,
  type VisualAgentProviderFixtureId,
  type VisualPersonFixtureId,
  type VisualRecordFixtureId,
  type VisualStatusFixtureId,
} from "./native-fixtures";
import { NativeAgentProviderIdentity, NativeStatusBadge, PersonIdentity } from "./native-visual-primitives";
import {
  AGENT_PIPELINE_STORYBOARD_LAYOUT,
  authoredConnectorPath,
  trimAuthoredConnector,
  type AuthoredStoryboardBox,
} from "./story-visual-layout";

import { cn } from "@/core/utils/cn";
import type { ContentLocale } from "@/i18n/locale-registry";

export const AGENT_PIPELINE_FILM_CONTRACT = {
  fps: 24,
  posterTime: 0.56,
  resolvedHold: { end: 0.78, start: 0.4 },
  seconds: 10,
  transitionWindows: [
    {
      end: 0.4,
      id: "agent-status-update",
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

export type AgentPipelineFilmBrief = {
  agentProvider: VisualAgentProviderFixtureId;
  assignedUser: VisualPersonFixtureId;
  instruction: string;
  record: VisualRecordFixtureId;
  statusChange: {
    from: VisualStatusFixtureId;
    to: VisualStatusFixtureId;
  };
};

export type AgentPipelineActivity = "resolved" | "thinking" | "updating";

export type AgentPipelineFilmState = {
  actionProgress: number;
  activity: AgentPipelineActivity;
  activityProgress: number;
  compositionOpacity: number;
  resetProgress: number;
  resolvedProgress: number;
  showOpeningState: boolean;
  transitProgress: number;
};

type AgentPipelinePlacement = keyof typeof AGENT_PIPELINE_STORYBOARD_LAYOUT;
type AgentPipelineScale = "film" | "preview";
type AgentPipelinePhase = "focal" | "opening" | "resolved";

function clamp(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function smoothProgress(time: number, start: number, end: number) {
  const progress = clamp((time - start) / (end - start));
  return progress * progress * (3 - 2 * progress);
}

export function agentPipelineFilmState(time: number): AgentPipelineFilmState {
  const t = clamp(time);
  const resetProgress = smoothProgress(t, 0.78, 0.94);
  const showOpeningState = t >= 0.86;
  const compositionOpacity =
    t < 0.78 ? 1 : t < 0.86 ? 1 - smoothProgress(t, 0.78, 0.86) : smoothProgress(t, 0.86, 0.94);

  if (showOpeningState) {
    return {
      actionProgress: 0,
      activity: "thinking",
      activityProgress: 0,
      compositionOpacity,
      resetProgress,
      resolvedProgress: 0,
      showOpeningState,
      transitProgress: 0,
    };
  }

  const actionProgress = smoothProgress(t, 0.03, 0.4);
  const transitProgress = smoothProgress(t, 0.1, 0.34);
  const resolvedProgress = smoothProgress(t, 0.32, 0.4);
  const activity = resolvedProgress >= 1 ? "resolved" : transitProgress > 0.01 ? "updating" : "thinking";

  return {
    actionProgress,
    activity,
    activityProgress: smoothProgress(t, 0.03, 0.1),
    compositionOpacity,
    resetProgress,
    resolvedProgress,
    showOpeningState,
    transitProgress,
  };
}

export const AGENT_PIPELINE_KEYFRAME_STATES = {
  focal: {
    actionProgress: 0.62,
    activity: "updating",
    activityProgress: 1,
    compositionOpacity: 1,
    resetProgress: 0,
    resolvedProgress: 0,
    showOpeningState: false,
    transitProgress: 0.52,
  },
  opening: {
    actionProgress: 0,
    activity: "thinking",
    activityProgress: 0,
    compositionOpacity: 1,
    resetProgress: 0,
    resolvedProgress: 0,
    showOpeningState: true,
    transitProgress: 0,
  },
  resolved: {
    actionProgress: 1,
    activity: "resolved",
    activityProgress: 1,
    compositionOpacity: 1,
    resetProgress: 0,
    resolvedProgress: 1,
    showOpeningState: false,
    transitProgress: 1,
  },
} as const satisfies Record<AgentPipelinePhase, AgentPipelineFilmState>;

function boxStyle(box: AuthoredStoryboardBox): CSSProperties {
  return {
    height: `${box.height}%`,
    left: `${box.x}%`,
    top: `${box.y}%`,
    width: `${box.width}%`,
  };
}

function recordBox(progress: number, placement: AgentPipelinePlacement): AuthoredStoryboardBox {
  const layout = AGENT_PIPELINE_STORYBOARD_LAYOUT[placement];
  const drawTarget = trimAuthoredConnector(layout.connector, progress).target;

  return {
    height: layout.record.height,
    width: layout.record.width,
    x: layout.record.follows === "x" ? drawTarget.x : layout.record.x,
    y: layout.record.follows === "y" ? drawTarget.y : layout.record.y,
  };
}

function PipelineConnector({
  phase,
  placement,
  progress,
  scale,
}: {
  phase?: AgentPipelinePhase;
  placement: AgentPipelinePlacement;
  progress: number;
  scale: AgentPipelineScale;
}) {
  const connector = AGENT_PIPELINE_STORYBOARD_LAYOUT[placement].connector;
  const visibleConnector = trimAuthoredConnector(connector, progress);

  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 z-10 size-full text-primary"
      data-film-connector="agent-status-update"
      data-pipeline-connector="status-transit"
      data-pipeline-phase={phase}
      data-pipeline-placement={placement}
      fill="none"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      <path
        d={authoredConnectorPath(connector, progress)}
        data-connector-draw-target={`${visibleConnector.target.x},${visibleConnector.target.y}`}
        data-connector-source={`${connector.source.x},${connector.source.y}`}
        data-connector-target={`${connector.target.x},${connector.target.y}`}
        data-motion-behavior="solid-prefix-draw"
        data-motion-progress={progress.toFixed(scale === "film" ? 4 : 3)}
        pathLength="1"
        stroke="currentColor"
        strokeLinecap="butt"
        strokeOpacity={progress === 0 ? 0 : 0.5 + 0.4 * (1 - Math.abs(progress - 0.5) * 2)}
        strokeWidth={scale === "film" ? 2.5 : 1.25}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function PipelineInstruction({
  brief,
  locale,
  placement,
  scale,
  state,
}: {
  brief: AgentPipelineFilmBrief;
  locale: ContentLocale;
  placement: AgentPipelinePlacement;
  scale: AgentPipelineScale;
  state: AgentPipelineFilmState;
}) {
  const copy = AGENT_PIPELINE_FILM_COPY[locale];

  return (
    <div
      className={cn(
        "absolute z-30 flex min-w-0 items-center rounded-xl border bg-card shadow-sm",
        scale === "film" ? "gap-4 px-5" : "gap-2 px-2.5",
        state.activity === "resolved" ? "border-border text-muted-foreground opacity-70" : "border-primary/65",
      )}
      data-pipeline-instruction={brief.instruction}
      style={boxStyle(AGENT_PIPELINE_STORYBOARD_LAYOUT[placement].instruction)}
    >
      <NativeAgentProviderIdentity
        className={cn("shrink-0 leading-none", scale === "film" ? "text-base" : "text-[8px]")}
        iconSize={scale === "film" ? 30 : 18}
        provider={brief.agentProvider}
      />

      <span
        className={cn(
          "min-w-0 flex-1 leading-tight font-medium text-foreground",
          scale === "film" ? "text-lg" : "text-[10px]",
        )}
      >
        {copy.instruction}
      </span>

      <span
        aria-label={copy.activity[state.activity]}
        className={cn(
          "flex shrink-0 items-center justify-center gap-0.5 rounded-full",
          scale === "film" ? "h-9 min-w-9" : "h-5 min-w-5",
          state.activity === "updating" ? "bg-primary/12 text-primary" : "bg-foreground/5 text-muted-foreground",
        )}
        data-agent-activity={state.activity}
      >
        {state.activity === "resolved" ? (
          <Check aria-hidden="true" className={scale === "film" ? "size-5" : "size-3"} strokeWidth={2} />
        ) : (
          [0, 1, 2].map((dot) => (
            <span
              key={dot}
              className={cn("rounded-full bg-current", scale === "film" ? "size-1.5" : "size-1")}
              style={{
                opacity: state.activity === "updating" ? 1 : 0.3 + 0.7 * clamp(state.activityProgress * 3 - dot),
              }}
            />
          ))
        )}
      </span>
    </div>
  );
}

function PipelineOriginStatus({
  placement,
  progress,
  status,
}: {
  placement: AgentPipelinePlacement;
  progress: number;
  status: VisualStatusFixtureId;
}) {
  const activity = 1 - progress;

  return (
    <div
      className={cn(
        "absolute z-20 flex",
        placement === "wide" ? "items-center justify-end" : "items-end justify-center",
      )}
      data-pipeline-stop="origin"
      data-pipeline-stop-port={placement === "wide" ? "right" : "bottom"}
      style={{
        ...boxStyle(AGENT_PIPELINE_STORYBOARD_LAYOUT[placement].origin),
        opacity: 0.45 + 0.55 * activity,
      }}
    >
      <NativeStatusBadge className={cn(activity > 0.95 && "ring-1 ring-current/20")} status={status} />
    </div>
  );
}

function PipelineRecord({
  brief,
  locale,
  phase,
  placement,
  scale,
  state,
}: {
  brief: AgentPipelineFilmBrief;
  locale: ContentLocale;
  phase?: AgentPipelinePhase;
  placement: AgentPipelinePlacement;
  scale: AgentPipelineScale;
  state: AgentPipelineFilmState;
}) {
  const layout = AGENT_PIPELINE_STORYBOARD_LAYOUT[placement];
  const drawTarget = trimAuthoredConnector(layout.connector, state.transitProgress).target;
  const nextRecordBox = recordBox(state.transitProgress, placement);
  const resolved = state.resolvedProgress >= 0.999;
  const record = VISUAL_RECORD_FIXTURES[brief.record];
  const copy = AGENT_PIPELINE_FILM_COPY[locale];

  return (
    <div
      className={cn(
        "absolute z-30 flex min-w-0 flex-col overflow-hidden rounded-card border bg-card shadow-lg shadow-primary/10",
        scale === "film" ? "p-5" : "p-2.5",
        state.transitProgress <= 0.001 ? "border-border-strong" : "border-primary/70",
      )}
      data-pipeline-record={brief.record}
      data-pipeline-record-entry={`${drawTarget.x},${drawTarget.y}`}
      data-pipeline-record-phase={phase}
      data-pipeline-record-placement={placement}
      data-pipeline-record-position={`${nextRecordBox.x},${nextRecordBox.y}`}
      data-pipeline-record-status={resolved ? brief.statusChange.to : brief.statusChange.from}
      style={boxStyle(nextRecordBox)}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span
          className={cn(
            "truncate leading-tight tracking-wide text-muted-foreground uppercase",
            scale === "film" ? "text-xs" : "text-[8px]",
          )}
        >
          {copy.recordKind}
        </span>

        <span className="grid shrink-0">
          <span className="col-start-1 row-start-1" style={{ opacity: 1 - state.resolvedProgress }}>
            <NativeStatusBadge status={brief.statusChange.from} />
          </span>

          <span className="col-start-1 row-start-1" style={{ opacity: state.resolvedProgress }}>
            <NativeStatusBadge status={brief.statusChange.to} />
          </span>
        </span>
      </div>

      <p
        className={cn(
          "line-clamp-2 leading-tight font-medium",
          scale === "film" ? "mt-4 text-xl" : "mt-1.5 text-[10px] sm:text-xs",
        )}
      >
        {record.name}
      </p>

      {placement === "wide" ? (
        <div className={cn("mt-auto min-w-0 border-t border-border", scale === "film" ? "pt-4" : "pt-1.5")}>
          <span
            className={cn(
              "mb-1 block leading-none tracking-wide text-muted-foreground uppercase",
              scale === "film" ? "text-xs" : "text-[8px]",
            )}
          >
            {copy.assignedUser}
          </span>

          <PersonIdentity person={brief.assignedUser} size={scale === "film" ? 32 : 20} />
        </div>
      ) : null}
    </div>
  );
}

export function AgentPipelineArtwork({
  brief,
  locale = "en",
  phase,
  placement,
  scale,
  state,
}: {
  brief: AgentPipelineFilmBrief;
  locale?: ContentLocale;
  phase?: AgentPipelinePhase;
  placement: AgentPipelinePlacement;
  scale: AgentPipelineScale;
  state: AgentPipelineFilmState;
}) {
  return (
    <div
      className="relative size-full"
      data-pipeline-phase={phase}
      data-pipeline-placement={placement}
      style={{ opacity: state.compositionOpacity }}
    >
      <div
        aria-hidden="true"
        className={cn(
          "absolute rounded-full bg-primary/12 blur-3xl",
          placement === "wide" ? "right-[-4%] bottom-[6%] size-[66%]" : "right-[-28%] bottom-[8%] size-[78%]",
        )}
      />

      <PipelineConnector phase={phase} placement={placement} progress={state.transitProgress} scale={scale} />

      <PipelineInstruction brief={brief} locale={locale} placement={placement} scale={scale} state={state} />

      <PipelineOriginStatus placement={placement} progress={state.transitProgress} status={brief.statusChange.from} />

      <PipelineRecord brief={brief} locale={locale} phase={phase} placement={placement} scale={scale} state={state} />
    </div>
  );
}

export function AgentPipelineFilm({
  brief,
  locale = "en",
  t,
}: {
  brief: AgentPipelineFilmBrief;
  locale?: ContentLocale;
  t: number;
}) {
  const state = agentPipelineFilmState(t);
  const copy = AGENT_PIPELINE_FILM_COPY[locale];

  return (
    <div
      aria-label={copy.ariaLabel}
      className="relative isolate h-[920px] w-[1280px] overflow-hidden bg-sidebar text-foreground"
      data-film-action-progress={state.actionProgress.toFixed(4)}
      data-film-activity-progress={state.activityProgress.toFixed(4)}
      data-film-composition-opacity={state.compositionOpacity.toFixed(4)}
      data-film-opening-state={state.showOpeningState ? "1" : "0"}
      data-film-reset-progress={state.resetProgress.toFixed(4)}
      data-film-resolved-progress={state.resolvedProgress.toFixed(4)}
      data-film-transit-progress={state.transitProgress.toFixed(4)}
      data-scene-film="agent-pipeline"
      role="img"
    >
      <div className="absolute inset-[7.8%_7%]">
        <AgentPipelineArtwork brief={brief} locale={locale} placement="wide" scale="film" state={state} />
      </div>
    </div>
  );
}
