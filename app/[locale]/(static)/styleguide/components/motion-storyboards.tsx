import type { ReactNode } from "react";

import {
  AGENT_PIPELINE_KEYFRAME_STATES,
  AgentPipelineArtwork,
} from "@/components/marketing/visuals/agent-pipeline-film";
import {
  DASHBOARD_INSIGHT_KEYFRAME_STATES,
  DashboardInsightArtwork,
} from "@/components/marketing/visuals/dashboard-insight-film";
import { NativeAgentProviderIdentity } from "@/components/marketing/visuals/native-visual-primitives";
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

function PipelineFrame({
  locale,
  phase,
  storyboard,
}: {
  locale: ContentLocale;
  phase: MotionFramePhase;
  storyboard: PipelineStoryboard;
}) {
  const state = AGENT_PIPELINE_KEYFRAME_STATES[phase];

  return (
    <div className="@container/pipeline size-full">
      <div className="size-full @sm/pipeline:hidden">
        <AgentPipelineArtwork
          brief={storyboard}
          locale={locale}
          phase={phase}
          placement="narrow"
          scale="preview"
          state={state}
        />
      </div>

      <div className="hidden size-full @sm/pipeline:block">
        <AgentPipelineArtwork
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
      <DashboardInsightArtwork
        brief={storyboard}
        locale={locale}
        phase={phase}
        scale="preview"
        state={DASHBOARD_INSIGHT_KEYFRAME_STATES[phase]}
      />
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
        description="These constraints belong to every benchmark film. All three approved storyboards now share their keyframes with deterministic normalized-time sources and declared transition windows."
        id="future-gates"
        title="Motion contract and benchmark capture gates"
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
