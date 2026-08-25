import type { CSSProperties, ReactNode } from "react";

import { Check, MousePointer2 } from "lucide-react";

import { VISUAL_RECORD_FIXTURES, type VisualStatusFixtureId } from "@/components/marketing/visuals/native-fixtures";
import {
  NativeAgentProviderIdentity,
  NativeStatusBadge,
  PersonIdentity,
} from "@/components/marketing/visuals/native-visual-primitives";
import {
  AGENT_PIPELINE_STORYBOARD_LAYOUT,
  authoredConnectorPath,
  trimAuthoredConnector,
  type AuthoredStoryboardBox,
} from "@/components/marketing/visuals/story-visual-layout";
import { UNIFIED_INBOX_KEYFRAME_STATES, UnifiedInboxArtwork } from "@/components/marketing/visuals/unified-inbox-film";
import type { ContentLocale } from "@/i18n/locale-registry";
import { MOTION_STORYBOARD_PRESENTATION_COPY } from "./motion-storyboards.copy";
import {
  MOTION_CONTRACT,
  MOTION_STORYBOARD_APPROVALS,
  MOTION_STORYBOARDS,
  TRANSITION_CAPTURE_GATE,
  type DashboardStoryboard,
  type InboxStoryboard,
  type MotionFramePhase,
  type MotionStoryboard,
  type PipelineStoryboard,
} from "./motion-storyboards.data";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { cn } from "@/core/utils/cn";

const MOTION_PRINCIPLES = [
  {
    label: "One actor",
    text: "The system event, external instruction, or human cursor that causes the state change is named before motion begins.",
  },
  {
    label: "One journey",
    text: "Opening, focal, and resolved keyframes describe one relationship from origin to result, without a second subplot.",
  },
  {
    label: "One honest hold",
    text: "The resolved frame is useful as a poster and holds long enough to be understood before a semantic reset.",
  },
] as const;

type DashboardStatus = DashboardStoryboard["segments"][number]["status"];

const STATUS_TOKEN_CLASSES: Record<DashboardStatus, string> = {
  "deal-lost": "bg-destructive ring-destructive/15",
  "deal-open": "bg-warning ring-warning/15",
  "deal-won": "bg-success ring-success/15",
};

const DASHBOARD_CURRENCY_FORMATTERS: Record<ContentLocale, Intl.NumberFormat> = {
  de: new Intl.NumberFormat("de-DE", {
    currency: "EUR",
    maximumFractionDigits: 0,
    style: "currency",
  }),
  en: new Intl.NumberFormat("en-US", {
    currency: "EUR",
    maximumFractionDigits: 0,
    style: "currency",
  }),
};

type StoryboardFrameProps = {
  artworkClassName?: string;
  children: ReactNode;
  index: number;
  locale: ContentLocale;
  phase: MotionFramePhase;
  state: string;
};

function StoryboardFrame({ artworkClassName, children, index, locale, phase, state }: StoryboardFrameProps) {
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-4 border-t border-border-strong pt-3">
        <code className="font-mono text-xs text-primary">{String(index + 1).padStart(2, "0")}</code>

        <span className="text-meta">{MOTION_STORYBOARD_PRESENTATION_COPY[locale].frameLabels[phase]}</span>
      </div>

      <div
        aria-label={state}
        className={cn("relative isolate aspect-[4/3] overflow-hidden bg-sidebar p-4", artworkClassName)}
        role="img"
      >
        <div
          aria-hidden
          className="absolute -top-1/3 left-1/2 size-3/4 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
        />

        <div aria-hidden className="relative flex h-full min-h-0 items-center justify-center">
          {children}
        </div>
      </div>

      <p className="text-meta mt-3 leading-relaxed">{state}</p>
    </div>
  );
}

function authoredBoxStyle(box: AuthoredStoryboardBox): CSSProperties {
  return {
    height: `${box.height}%`,
    left: `${box.x}%`,
    top: `${box.y}%`,
    width: `${box.width}%`,
  };
}

function InboxFrame({
  locale,
  phase,
  storyboard,
}: {
  locale: ContentLocale;
  phase: MotionFramePhase;
  storyboard: InboxStoryboard;
}) {
  const state = UNIFIED_INBOX_KEYFRAME_STATES[phase];

  return (
    <div className="@container/inbox size-full">
      <div className="size-full @sm/inbox:hidden">
        <UnifiedInboxArtwork
          brief={storyboard}
          locale={locale}
          phase={phase}
          placement="narrow"
          scale="preview"
          state={state}
        />
      </div>

      <div className="hidden size-full @sm/inbox:block">
        <UnifiedInboxArtwork
          brief={storyboard}
          locale={locale}
          phase={phase}
          placement="wide"
          scale="preview"
          state={state}
        />
      </div>
    </div>
  );
}

type PipelinePlacement = keyof typeof AGENT_PIPELINE_STORYBOARD_LAYOUT;

const PIPELINE_CONNECTOR_PROGRESS: Record<MotionFramePhase, number> = {
  focal: 0.52,
  opening: 0,
  resolved: 1,
};

function pipelineRecordBox(phase: MotionFramePhase, placement: PipelinePlacement): AuthoredStoryboardBox {
  const layout = AGENT_PIPELINE_STORYBOARD_LAYOUT[placement];
  const drawTarget = trimAuthoredConnector(layout.connector, PIPELINE_CONNECTOR_PROGRESS[phase]).target;

  return {
    height: layout.record.height,
    width: layout.record.width,
    x: layout.record.follows === "x" ? drawTarget.x : layout.record.x,
    y: layout.record.follows === "y" ? drawTarget.y : layout.record.y,
  };
}

function PipelineConnector({ phase, placement }: { phase: MotionFramePhase; placement: PipelinePlacement }) {
  const connector = AGENT_PIPELINE_STORYBOARD_LAYOUT[placement].connector;
  const progress = PIPELINE_CONNECTOR_PROGRESS[phase];
  const visibleConnector = trimAuthoredConnector(connector, progress);

  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 z-10 size-full text-primary"
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
        data-motion-progress={progress.toFixed(3)}
        pathLength="1"
        stroke="currentColor"
        strokeLinecap="butt"
        strokeOpacity={phase === "opening" ? 0 : phase === "focal" ? 0.9 : 0.5}
        strokeWidth={1.25}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function PipelineInstruction({
  locale,
  phase,
  placement,
  storyboard,
}: {
  locale: ContentLocale;
  phase: MotionFramePhase;
  placement: PipelinePlacement;
  storyboard: PipelineStoryboard;
}) {
  const activity = phase === "opening" ? "thinking" : phase === "focal" ? "updating" : "resolved";
  const copy = MOTION_STORYBOARD_PRESENTATION_COPY[locale].pipeline;

  return (
    <div
      className={cn(
        "absolute z-30 flex min-w-0 items-center gap-2 rounded-xl border bg-card px-2.5 shadow-sm",
        phase === "resolved" ? "border-border text-muted-foreground opacity-70" : "border-primary/65",
      )}
      data-pipeline-instruction={storyboard.instruction}
      style={authoredBoxStyle(AGENT_PIPELINE_STORYBOARD_LAYOUT[placement].instruction)}
    >
      <NativeAgentProviderIdentity
        className="shrink-0 text-[8px] leading-none"
        iconSize={18}
        provider={storyboard.agentProvider}
      />

      <span className="min-w-0 flex-1 text-[10px] leading-tight font-medium text-foreground">{copy.instruction}</span>

      <span
        aria-label={copy.activity[activity]}
        className={cn(
          "flex h-5 min-w-5 shrink-0 items-center justify-center gap-0.5 rounded-full",
          phase === "focal" ? "bg-primary/12 text-primary" : "bg-foreground/5 text-muted-foreground",
        )}
        data-agent-activity={activity}
      >
        {phase === "resolved" ? (
          <Check aria-hidden="true" className="size-3" strokeWidth={2} />
        ) : (
          [0, 1, 2].map((dot) => (
            <span
              key={dot}
              className={cn("size-1 rounded-full bg-current", phase === "opening" && dot > 0 && "opacity-35")}
            />
          ))
        )}
      </span>
    </div>
  );
}

function PipelineStatusStop({
  phase,
  placement,
  status,
  stop,
}: {
  phase: MotionFramePhase;
  placement: PipelinePlacement;
  status: VisualStatusFixtureId;
  stop: "destination" | "origin";
}) {
  const active = (stop === "origin" && phase === "opening") || (stop === "destination" && phase === "resolved");

  return (
    <div
      className={cn(
        "absolute z-20 flex",
        stop === "origin" && placement === "wide"
          ? "items-center justify-end"
          : stop === "origin"
            ? "items-end justify-center"
            : "items-center justify-center",
        active ? "opacity-100" : phase === "focal" ? "opacity-75" : "opacity-45",
      )}
      data-pipeline-stop={stop}
      data-pipeline-stop-port={stop === "origin" ? (placement === "wide" ? "right" : "bottom") : "none"}
      style={authoredBoxStyle(AGENT_PIPELINE_STORYBOARD_LAYOUT[placement][stop])}
    >
      <NativeStatusBadge className={cn(active && "ring-1 ring-current/20")} status={status} />
    </div>
  );
}

function PipelineRecord({
  locale,
  phase,
  placement,
  storyboard,
}: {
  locale: ContentLocale;
  phase: MotionFramePhase;
  placement: PipelinePlacement;
  storyboard: PipelineStoryboard;
}) {
  const progress = PIPELINE_CONNECTOR_PROGRESS[phase];
  const drawTarget = trimAuthoredConnector(AGENT_PIPELINE_STORYBOARD_LAYOUT[placement].connector, progress).target;
  const recordBox = pipelineRecordBox(phase, placement);
  const status = phase === "resolved" ? storyboard.statusChange.to : storyboard.statusChange.from;
  const record = VISUAL_RECORD_FIXTURES[storyboard.record];

  return (
    <div
      className={cn(
        "absolute z-30 flex min-w-0 flex-col overflow-hidden rounded-card border bg-card p-2.5 shadow-lg shadow-primary/10",
        phase === "opening" ? "border-border-strong" : "border-primary/70",
      )}
      data-pipeline-record={storyboard.record}
      data-pipeline-record-entry={`${drawTarget.x},${drawTarget.y}`}
      data-pipeline-record-phase={phase}
      data-pipeline-record-placement={placement}
      data-pipeline-record-position={`${recordBox.x},${recordBox.y}`}
      data-pipeline-record-status={status}
      style={authoredBoxStyle(recordBox)}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-[8px] leading-tight tracking-wide text-muted-foreground uppercase">
          {record.kind}
        </span>

        <NativeStatusBadge status={status} />
      </div>

      <p className="mt-1.5 line-clamp-2 text-[10px] leading-tight font-medium sm:text-xs">{record.name}</p>

      {placement === "wide" ? (
        <div className="mt-auto min-w-0 border-t border-border pt-1.5">
          <span className="mb-1 block text-[8px] leading-none tracking-wide text-muted-foreground uppercase">
            {MOTION_STORYBOARD_PRESENTATION_COPY[locale].pipeline.assignedUser}
          </span>

          <PersonIdentity person={storyboard.assignedUser} size={20} />
        </div>
      ) : null}
    </div>
  );
}

function PipelineComposition({
  locale,
  phase,
  placement,
  storyboard,
}: {
  locale: ContentLocale;
  phase: MotionFramePhase;
  placement: PipelinePlacement;
  storyboard: PipelineStoryboard;
}) {
  return (
    <div className="relative size-full" data-pipeline-phase={phase} data-pipeline-placement={placement}>
      <div
        aria-hidden="true"
        className={cn(
          "absolute rounded-full bg-primary/12 blur-3xl",
          placement === "wide" ? "right-[-4%] bottom-[6%] size-[66%]" : "right-[-28%] bottom-[8%] size-[78%]",
        )}
      />

      <PipelineConnector phase={phase} placement={placement} />

      <PipelineInstruction locale={locale} phase={phase} placement={placement} storyboard={storyboard} />

      <PipelineStatusStop phase={phase} placement={placement} status={storyboard.statusChange.from} stop="origin" />

      <PipelineStatusStop phase={phase} placement={placement} status={storyboard.statusChange.to} stop="destination" />

      <PipelineRecord locale={locale} phase={phase} placement={placement} storyboard={storyboard} />
    </div>
  );
}

function PipelineFrame({
  locale,
  phase,
  storyboard,
}: {
  locale: ContentLocale;
  phase: MotionFramePhase;
  storyboard: PipelineStoryboard;
}) {
  return (
    <div className="@container/pipeline size-full">
      <div className="size-full @sm/pipeline:hidden">
        <PipelineComposition locale={locale} phase={phase} placement="narrow" storyboard={storyboard} />
      </div>

      <div className="hidden size-full @sm/pipeline:block">
        <PipelineComposition locale={locale} phase={phase} placement="wide" storyboard={storyboard} />
      </div>
    </div>
  );
}

function DashboardCard({
  locale,
  phase,
  storyboard,
}: {
  locale: ContentLocale;
  phase: MotionFramePhase;
  storyboard: DashboardStoryboard;
}) {
  const hasSelection = phase !== "opening";
  const selectedSegment = storyboard.segments.find(({ status }) => status === storyboard.selectedSegment);

  if (!selectedSegment) throw new Error("Dashboard insight requires its selected fixture-backed Status group");

  const copy = MOTION_STORYBOARD_PRESENTATION_COPY[locale].dashboard;
  const selectedTotalValue = DASHBOARD_CURRENCY_FORMATTERS[locale].format(selectedSegment.totalValue);
  const selectionLabel = `${selectedSegment.count} ${copy.deals} · ${selectedTotalValue} ${copy.totalValue}`;

  return (
    <div
      className="relative w-full rounded-xl border border-border bg-card p-3"
      data-dashboard-distribution="discrete-status-groups"
      data-dashboard-phase={phase}
      data-dashboard-quantity-encoding={storyboard.quantityEncoding}
      data-dashboard-value-disclosure={storyboard.valueDisclosure}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium">{copy.widget}</span>

        <span className="text-xs tracking-wide text-muted-foreground uppercase">{copy.status}</span>
      </div>

      <div className="mt-4 space-y-2.5">
        {storyboard.segments.map((segment) => {
          const isSelected = hasSelection && segment.status === storyboard.selectedSegment;

          return (
            <div
              key={segment.status}
              className={cn(
                "relative grid min-h-10 grid-cols-[5rem_minmax(0,1fr)_1.25rem] items-center gap-2 rounded-lg border p-2",
                isSelected
                  ? "-translate-y-0.5 border-border-strong bg-background shadow-sm"
                  : "border-transparent bg-background/45",
                hasSelection && !isSelected && "opacity-50",
              )}
              data-dashboard-selected={isSelected ? "true" : "false"}
              data-dashboard-status-group={segment.status}
              data-dashboard-token-count={segment.count}
            >
              <NativeStatusBadge status={segment.status} />

              <div className="flex min-w-0 flex-wrap items-center gap-1" data-dashboard-token-group={segment.status}>
                {Array.from({ length: segment.count }, (_, index) => (
                  <span
                    key={`${segment.status}-${index}`}
                    aria-hidden="true"
                    className={cn(
                      "size-2.5 shrink-0 rounded-full ring-2",
                      STATUS_TOKEN_CLASSES[segment.status],
                      !isSelected && hasSelection && "opacity-55",
                    )}
                    data-dashboard-deal-token={segment.status}
                    data-dashboard-token-index={index + 1}
                  />
                ))}
              </div>

              <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">{segment.count}</span>

              {phase === "focal" && isSelected ? (
                <MousePointer2
                  className="absolute -right-1 -bottom-2 size-5 text-primary drop-shadow-sm"
                  data-dashboard-cursor="causal-human"
                  fill="currentColor"
                  strokeWidth={1.5}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-3 min-h-7 border-t border-border pt-2">
        {hasSelection ? (
          <div
            className="flex items-center justify-between gap-2 text-xs"
            data-dashboard-callout={selectionLabel}
            data-dashboard-total-value={selectedSegment.totalValue}
          >
            <span className="text-muted-foreground">{`${selectedSegment.count} ${copy.deals}`}</span>

            <span className="font-medium">{`${selectedTotalValue} ${copy.total}`}</span>
          </div>
        ) : (
          <span aria-hidden="true" className="block h-4" />
        )}
      </div>
    </div>
  );
}

function DashboardFrame({
  locale,
  phase,
  storyboard,
}: {
  locale: ContentLocale;
  phase: MotionFramePhase;
  storyboard: DashboardStoryboard;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-1">
      <DashboardCard locale={locale} phase={phase} storyboard={storyboard} />
    </div>
  );
}

function FrameArtwork({
  locale,
  phase,
  storyboard,
}: {
  locale: ContentLocale;
  phase: MotionFramePhase;
  storyboard: MotionStoryboard;
}) {
  if (storyboard.kind === "inbox") return <InboxFrame locale={locale} phase={phase} storyboard={storyboard} />;
  if (storyboard.kind === "pipeline") return <PipelineFrame locale={locale} phase={phase} storyboard={storyboard} />;
  return <DashboardFrame locale={locale} phase={phase} storyboard={storyboard} />;
}

function StoryboardSection({ locale, storyboard }: { locale: ContentLocale; storyboard: MotionStoryboard }) {
  const journey = storyboard.journeys[0];
  const approval = MOTION_STORYBOARD_APPROVALS[storyboard.id];
  const localizedStates = MOTION_STORYBOARD_PRESENTATION_COPY[locale].frameStates[storyboard.id];

  return (
    <MarketingSection description={storyboard.description} id={storyboard.id} title={storyboard.title}>
      <div
        className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs"
        data-storyboard-approval={approval.status}
      >
        <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1.5 font-medium text-success">
          Keyframes approved
        </span>

        <code className="font-mono text-muted-foreground">{approval.checksum}</code>
      </div>

      <div
        className={cn(
          "mt-10 grid gap-5 lg:mt-12",
          storyboard.kind === "dashboard" ? "lg:grid-cols-3" : "xl:grid-cols-3",
        )}
      >
        {storyboard.frames.map((frame, index) => (
          <StoryboardFrame
            key={frame.phase}
            artworkClassName={
              storyboard.kind === "dashboard" ? "sm:aspect-video lg:aspect-[4/3]" : "aspect-[3/4] p-0 sm:aspect-[4/3]"
            }
            index={index}
            locale={locale}
            phase={frame.phase}
            state={localizedStates?.[frame.phase] ?? frame.state}
          >
            <FrameArtwork locale={locale} phase={frame.phase} storyboard={storyboard} />
          </StoryboardFrame>
        ))}
      </div>

      <div className="mt-8 grid gap-4 rounded-card border border-border bg-card p-5 md:grid-cols-[0.75fr_2fr] md:p-6">
        <div>
          <p className="text-meta">Actor</p>

          {storyboard.kind === "pipeline" ? (
            <div className="mt-2">
              <NativeAgentProviderIdentity className="text-sm" iconSize={20} provider={storyboard.agentProvider} />

              <p className="text-meta mt-1">external client</p>
            </div>
          ) : (
            <p className="mt-1 text-sm font-medium">{storyboard.actor.replaceAll("-", " ")}</p>
          )}
        </div>

        <div>
          <p className="text-meta">One journey</p>

          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm leading-relaxed">
            <span>{journey.origin}</span>

            <span className="text-primary">→</span>

            <span>{journey.change}</span>

            <span className="text-primary">→</span>

            <span>{journey.result}</span>
          </p>
        </div>

        <div className="md:col-span-2">
          <p className="text-meta">Truth source</p>

          <div className="mt-2 flex flex-wrap gap-2">
            {storyboard.sourceFacts.map((source) => (
              <code
                key={source}
                className="break-all rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
              >
                {source}
              </code>
            ))}
          </div>
        </div>
      </div>
    </MarketingSection>
  );
}

export function MotionStoryboards({ locale = "en" }: { locale?: ContentLocale }) {
  return (
    <>
      <MarketingSection
        description="A film is planned as three reviewable moments before any timeline is authored. These boards define the event, the point of focus, and the honest state that remains."
        id="motion-grammar"
        title="One cause, one change, one resolved frame"
      >
        <div className="mt-14 grid gap-4 md:grid-cols-3 lg:mt-16">
          {MOTION_PRINCIPLES.map((principle, index) => (
            <div key={principle.label} className="rounded-card border border-border bg-card p-5">
              <code className="font-mono text-xs text-primary">{String(index + 1).padStart(2, "0")}</code>

              <h3 className="mt-6 text-lg font-medium">{principle.label}</h3>

              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{principle.text}</p>
            </div>
          ))}
        </div>
      </MarketingSection>

      <StoryboardSection locale={locale} storyboard={MOTION_STORYBOARDS[0]} />

      <StoryboardSection locale={locale} storyboard={MOTION_STORYBOARDS[1]} />

      <StoryboardSection locale={locale} storyboard={MOTION_STORYBOARDS[2]} />

      <MarketingSection
        description="These constraints belong to every future film. Unified inbox now exercises the active transition-window gate; the other retained films remain untouched until they are rebuilt."
        id="future-gates"
        title="Motion contract and active capture gate"
      >
        <ol className="mt-14 grid gap-3 md:grid-cols-2 lg:mt-16">
          {MOTION_CONTRACT.map((rule, index) => (
            <li key={rule} className="flex gap-4 rounded-card border border-border bg-card p-4">
              <code className="shrink-0 font-mono text-xs text-primary">{String(index + 1).padStart(2, "0")}</code>

              <span className="text-sm leading-relaxed">{rule}</span>
            </li>
          ))}
        </ol>

        <div className="mt-8 rounded-card border border-border bg-sidebar p-5 md:p-7">
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-eyebrow">Active implementation</p>

              <h3 className="mt-4 text-xl font-medium">Declared transition windows</h3>

              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{TRANSITION_CAPTURE_GATE.adoption}</p>
            </div>

            <div className="space-y-3">
              {[TRANSITION_CAPTURE_GATE.outside, TRANSITION_CAPTURE_GATE.inside, TRANSITION_CAPTURE_GATE.proof].map(
                (rule) => (
                  <p key={rule} className="rounded-xl border border-border bg-card p-4 text-sm leading-relaxed">
                    {rule}
                  </p>
                ),
              )}
            </div>
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <p className="text-meta">Gates that remain</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {TRANSITION_CAPTURE_GATE.retained.map((gate) => (
                <span key={gate} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs">
                  {gate}
                </span>
              ))}
            </div>
          </div>
        </div>
      </MarketingSection>
    </>
  );
}
