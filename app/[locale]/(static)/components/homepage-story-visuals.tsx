"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, Ref } from "react";
import type { HomepageVisualLabels } from "@/core/fumadocs/schemas/homepage";

import { animate, cubicBezier, motion, useMotionValue, useTransform } from "framer-motion";
import type { MotionValue } from "framer-motion";
import { Check, MousePointer2, Send } from "lucide-react";

import {
  NativeAgentProviderIdentity,
  NativeStatusBadge,
  PersonAvatar,
  PersonIdentity,
  ProviderIdentity,
  ProviderMark,
} from "@/components/marketing/visuals/native-visual-primitives";
import {
  VISUAL_CONVERSATION_FIXTURES,
  VISUAL_PERSON_FIXTURES,
  VISUAL_PROVIDER_SET_FIXTURES,
  VISUAL_RECORD_FIXTURES,
  type VisualAgentProviderFixtureId,
  type VisualProviderFixtureId,
  type VisualRecordFixtureId,
} from "@/components/marketing/visuals/native-fixtures";
import { COMPOUND_CONNECTOR_STROKE } from "@/components/marketing/visuals/story-visual-layout";
import { VisualArtboard as MarketingVisualArtboard } from "@/components/marketing/visuals/visual-artboard";
import { cn } from "@/core/utils/cn";
import { formattingTagFor, type ContentLocale } from "@/i18n/locale-registry";

import { useHomepageMotion } from "./homepage-motion";

type VisualProps = {
  className?: string;
  labels: HomepageVisualLabels;
  locale: ContentLocale;
};

type VisualArtboardName = "agent-record" | "human-handoff" | "omnichannel-record" | "pipeline";

const MARKETING_MOTION_EASE = [0.22, 1, 0.36, 1] as const;
const SIGNAL_EASES = {
  drift: [0.38, 0.1, 0.3, 1],
  settle: MARKETING_MOTION_EASE,
  swift: [0.2, 0.75, 0.35, 1],
} as const;
const PIPELINE_LOOP_SECONDS = 12;
const PIPELINE_LOOP_TRANSITION = {
  duration: PIPELINE_LOOP_SECONDS,
  ease: MARKETING_MOTION_EASE,
  repeat: Number.POSITIVE_INFINITY,
};
const HANDOFF_DRAFT_LINES = ["w-[92%] bg-placeholder", "w-[76%] bg-muted", "w-[54%] bg-muted"];
const SIGNAL_ACTIVITY_TIMES = [0, 0.02, 0.12, 0.9, 0.98, 1];
const SIGNAL_ACTIVITY_VALUES = [0, 0, 1, 1, 0, 0];
const SIGNAL_TRAVEL_TIMES = [0, 0.12, 0.9, 1];
const SIGNAL_TRAVEL_VALUES = [0, 0, 1, 1];
const PROVIDER_ARRIVAL_OPACITY = [0, 0.65, 0];
const PROVIDER_ARRIVAL_SCALE = [1, 1.015, 1];
const PROVIDER_ARRIVAL_TIMES = [0, 0.45, 1];
const PROVIDER_ARRIVAL_DELAY_RATIO = 0.72;
const PROVIDER_ARRIVAL_DURATION_RATIO = 0.22;
const PIPELINE_DRAG_TIMES = [0, 0.08, 0.14, 0.3, 0.38, 0.54, 0.62, 0.76, 0.84, 0.94, 1];
const PIPELINE_DRAG_X = ["0%", "0%", "0%", "110%", "110%", "220%", "220%", "110%", "110%", "0%", "0%"];
const PIPELINE_DRAG_Y = [-18, -18, -12, 4, 4, 28, 28, 4, 4, -18, -18];
const PIPELINE_SOURCE_OUTLINE_OPACITY = [0, 1, 1, 1, 1, 1, 1, 1, 0.55, 0, 0];
const APPROVED_INBOX_PROVIDERS = new Set(VISUAL_PROVIDER_SET_FIXTURES["unified-inbox"].providers);

type SignalEase = keyof typeof SIGNAL_EASES;
type OneToThree<T> = readonly [T] | readonly [T, T] | readonly [T, T, T];
type TimedScene = { durationMs: number };
type TimedSignal = {
  delayMs: number;
  durationMs: number;
  ease: SignalEase;
};
type SignalTimeline = {
  activity: MotionValue<number>;
  travel: MotionValue<number>;
};

const LINEAR_EASE = (progress: number) => progress;
const SIGNAL_EASING_FUNCTIONS = {
  drift: cubicBezier(...SIGNAL_EASES.drift),
  settle: cubicBezier(...SIGNAL_EASES.settle),
  swift: cubicBezier(...SIGNAL_EASES.swift),
} satisfies Record<SignalEase, (progress: number) => number>;

function useSignalTimeline(signal: TimedSignal, shouldAnimate: boolean): SignalTimeline {
  const phase = useMotionValue(0);
  const activity = useTransform(phase, SIGNAL_ACTIVITY_TIMES, SIGNAL_ACTIVITY_VALUES);
  const travel = useTransform(phase, SIGNAL_TRAVEL_TIMES, SIGNAL_TRAVEL_VALUES, {
    ease: [LINEAR_EASE, SIGNAL_EASING_FUNCTIONS[signal.ease], LINEAR_EASE],
  });

  useEffect(() => {
    phase.set(0);
    if (!shouldAnimate) return;

    const controls = animate(phase, 1, {
      delay: signal.delayMs / 1_000,
      duration: signal.durationMs / 1_000,
      ease: LINEAR_EASE,
    });

    return () => controls.stop();
  }, [phase, shouldAnimate, signal.delayMs, signal.durationMs, signal.ease]);

  return { activity, travel };
}

function useTimedSceneCycle<TScene extends TimedScene>(scenes: readonly TScene[], shouldAnimate: boolean) {
  const [position, setPosition] = useState({ revision: 0, sceneIndex: 0 });

  useEffect(() => {
    if (!shouldAnimate) return;

    const timeout = window.setTimeout(() => {
      setPosition(({ revision, sceneIndex }) => ({
        revision: revision + 1,
        sceneIndex: (sceneIndex + 1) % scenes.length,
      }));
    }, scenes[position.sceneIndex].durationMs);

    return () => window.clearTimeout(timeout);
  }, [position.sceneIndex, scenes, shouldAnimate]);

  return {
    revision: position.revision,
    scene: scenes[position.sceneIndex],
  };
}

const STAGE_CROP_CLASSES: Record<VisualArtboardName, string> = {
  "agent-record": "-right-[22%] -top-[38%] rotate-[-12deg]",
  "human-handoff": "-bottom-[72%] -left-[36%] rotate-[14deg]",
  "omnichannel-record": "-right-[24%] -top-[42%] rotate-[-10deg]",
  pipeline: "-top-[46%] left-[34%] rotate-[4deg]",
};

function HomepageVisualArtboard({
  children,
  className,
  label,
  motionActive,
  motionRef,
  name,
}: {
  children: ReactNode;
  className?: string;
  label: string;
  motionActive?: boolean;
  motionRef?: Ref<HTMLDivElement>;
  name: VisualArtboardName;
}) {
  const artboard = (
    <MarketingVisualArtboard
      aria-label={label}
      className={cn(
        "[background-image:radial-gradient(circle_at_18%_12%,color-mix(in_oklab,var(--foreground)_6%,transparent),transparent_34%),radial-gradient(circle_at_82%_78%,color-mix(in_oklab,var(--primary)_6%,transparent),transparent_42%)]",
        className,
      )}
      data-homepage-visual={name}
    >
      <div
        aria-hidden
        className="absolute inset-0 z-0 opacity-45 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_76%_72%_at_50%_50%,black,transparent_86%)]"
      />

      <div
        aria-hidden
        className={cn(
          "absolute z-0 h-[72%] w-[68%] rounded-full border border-border bg-card/25",
          STAGE_CROP_CLASSES[name],
        )}
      />

      {children}
    </MarketingVisualArtboard>
  );

  if (!motionRef) return artboard;

  return (
    <div
      ref={motionRef}
      className="w-full"
      data-homepage-motion-scene={name}
      data-motion-active={motionActive ? "true" : "false"}
    >
      {artboard}
    </div>
  );
}

export function HomepageAgentRecordVisual({ className, labels, locale }: VisualProps) {
  const conversation = VISUAL_CONVERSATION_FIXTURES["gmail-rollout-next-steps"];
  const person = VISUAL_PERSON_FIXTURES[conversation.person];

  return (
    <HomepageVisualArtboard
      className={cn("aspect-[4/5] min-h-[31rem] sm:aspect-[8/5] sm:min-h-0", className)}
      label={`${labels.agentActivity}: ${person.name}`}
      name="agent-record"
    >
      <svg aria-hidden className="absolute inset-0 size-full" preserveAspectRatio="none" viewBox="0 0 800 500">
        <path
          d="M205 138 C292 138 300 218 363 218"
          fill="none"
          stroke="var(--border-strong)"
          strokeLinecap="butt"
          strokeWidth="1.5"
        />

        <path
          d="M437 318 C486 368 571 365 615 325"
          fill="none"
          stroke="var(--border-strong)"
          strokeLinecap="butt"
          strokeWidth="1.5"
        />
      </svg>

      <div className="absolute left-[8%] top-[9%] z-10 rounded-full border border-border bg-card px-3 py-2 shadow-sm sm:left-[10%] sm:top-[20%]">
        <NativeAgentProviderIdentity iconSize={20} provider="claude" />

        <span aria-hidden className="mt-1.5 flex items-center gap-1 pl-7">
          <span className="size-1 rounded-full bg-primary" />

          <span className="size-1 rounded-full bg-primary/65" />

          <span className="size-1 rounded-full bg-primary/30" />
        </span>
      </div>

      <div className="absolute left-[12%] top-[35%] z-10 w-[76%] overflow-hidden rounded-card border border-border bg-card p-5 shadow-xl shadow-black/10 dark:shadow-black/30 sm:left-[36%] sm:top-[24%] sm:w-[46%] sm:p-7">
        <div
          className="-mx-5 flex items-start justify-between gap-4 border-b border-border px-5 pb-5 sm:-mx-7 sm:px-7"
          data-homepage-rules="full-bleed"
        >
          <div>
            <p className="text-meta">{labels.connectedRecord}</p>

            <div className="mt-3 flex items-center gap-3">
              <PersonAvatar person={conversation.person} size={42} />

              <div>
                <p className="font-medium">{person.name}</p>

                <p className="mt-0.5 text-xs text-muted-foreground">{labels.customerRecord}</p>
              </div>
            </div>
          </div>

          <ProviderIdentity className="text-[10px]" iconSize={16} provider={conversation.provider} />
        </div>

        <div className="mt-5 rounded-xl bg-muted p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
              {labels.latestActivity}
            </p>

            <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
              <span aria-hidden className="size-1.5 rounded-full bg-warning" />

              {labels.open}
            </span>
          </div>

          <p className="mt-2 text-xs font-medium">{conversation.localizedSubject[locale]}</p>

          <div className="mt-3 space-y-2">
            <div className="h-1.5 w-[88%] rounded-full bg-placeholder" />

            <div className="h-1.5 w-[62%] rounded-full bg-muted" />
          </div>
        </div>
      </div>

      <div className="absolute bottom-[7%] right-[7%] z-20 flex items-center gap-2 rounded-xl border border-border-strong bg-card p-2 shadow-lg sm:bottom-[13%] sm:right-[8%]">
        <span className="grid size-7 place-items-center rounded-lg bg-success/15 text-success">
          <Check aria-hidden className="size-4" strokeWidth={2.25} />
        </span>

        <span className="pr-1 text-xs font-medium">{labels.readyForReview}</span>
      </div>
    </HomepageVisualArtboard>
  );
}

type OrbitPoint = readonly [x: number, y: number];

type OrbitLayout = {
  node: OrbitPoint;
  target: OrbitPoint;
};

type OrbitNode = {
  desktop: OrbitLayout;
  mobile: OrbitLayout;
  provider: VisualProviderFixtureId;
};

const ORBIT_NODES = [
  {
    desktop: { node: [120, 112], target: [275, 245] },
    mobile: { node: [85, 85], target: [138, 205] },
    provider: "gmail",
  },
  {
    desktop: { node: [95, 310], target: [275, 310] },
    mobile: { node: [55, 330], target: [126, 330] },
    provider: "outlook",
  },
  {
    desktop: { node: [220, 552], target: [365, 400] },
    mobile: { node: [160, 660], target: [160, 400] },
    provider: "imap",
  },
  {
    desktop: { node: [500, 62], target: [500, 180] },
    mobile: { node: [300, 55], target: [300, 205] },
    provider: "telegram",
  },
  {
    desktop: { node: [880, 112], target: [725, 245] },
    mobile: { node: [515, 85], target: [462, 205] },
    provider: "linkedin",
  },
  {
    desktop: { node: [905, 310], target: [725, 310] },
    mobile: { node: [545, 330], target: [474, 330] },
    provider: "whatsapp",
  },
  {
    desktop: { node: [780, 552], target: [635, 400] },
    mobile: { node: [440, 660], target: [440, 400] },
    provider: "instagram",
  },
] as const satisfies readonly OrbitNode[];

type OmnichannelSignalSpec = {
  delayMs: number;
  durationMs: number;
  ease: SignalEase;
  provider: VisualProviderFixtureId;
};

type OmnichannelSignalBurst = {
  durationMs: number;
  signals: OneToThree<OmnichannelSignalSpec>;
};

const OMNICHANNEL_SIGNAL_BURSTS = [
  {
    durationMs: 2_800,
    signals: [
      { delayMs: 0, durationMs: 2_600, ease: "settle", provider: "gmail" },
      { delayMs: 750, durationMs: 2_000, ease: "drift", provider: "telegram" },
    ],
  },
  {
    durationMs: 3_500,
    signals: [
      { delayMs: 0, durationMs: 3_000, ease: "drift", provider: "whatsapp" },
      { delayMs: 450, durationMs: 2_400, ease: "settle", provider: "linkedin" },
      { delayMs: 1_200, durationMs: 2_200, ease: "swift", provider: "imap" },
    ],
  },
  {
    durationMs: 3_150,
    signals: [
      { delayMs: 0, durationMs: 2_700, ease: "settle", provider: "outlook" },
      { delayMs: 650, durationMs: 2_400, ease: "drift", provider: "instagram" },
    ],
  },
  {
    durationMs: 3_750,
    signals: [
      { delayMs: 0, durationMs: 3_100, ease: "drift", provider: "telegram" },
      { delayMs: 800, durationMs: 2_400, ease: "settle", provider: "gmail" },
      {
        delayMs: 1_450,
        durationMs: 2_200,
        ease: "swift",
        provider: "whatsapp",
      },
    ],
  },
  {
    durationMs: 3_200,
    signals: [
      { delayMs: 0, durationMs: 2_800, ease: "settle", provider: "linkedin" },
      { delayMs: 600, durationMs: 2_500, ease: "drift", provider: "outlook" },
    ],
  },
  {
    durationMs: 3_700,
    signals: [
      { delayMs: 0, durationMs: 3_100, ease: "drift", provider: "instagram" },
      { delayMs: 700, durationMs: 2_500, ease: "settle", provider: "imap" },
      { delayMs: 1_500, durationMs: 2_100, ease: "swift", provider: "gmail" },
    ],
  },
] as const satisfies readonly OmnichannelSignalBurst[];

type OrbitPositionStyle = CSSProperties &
  Record<"--orbit-desktop-x" | "--orbit-desktop-y" | "--orbit-mobile-x" | "--orbit-mobile-y", string>;

function orbitPositionStyle({ desktop, mobile }: OrbitNode): OrbitPositionStyle {
  return {
    "--orbit-desktop-x": `${desktop.node[0] / 10}%`,
    "--orbit-desktop-y": `${(desktop.node[1] / 620) * 100}%`,
    "--orbit-mobile-x": `${mobile.node[0] / 6}%`,
    "--orbit-mobile-y": `${(mobile.node[1] / 760) * 100}%`,
  };
}

function SyncedSignalPath({
  kind,
  path,
  provider,
  start,
  timeline,
}: {
  kind: "handoff" | "omnichannel";
  path: string;
  provider: VisualAgentProviderFixtureId | VisualProviderFixtureId;
  start: OrbitPoint;
  timeline: SignalTimeline;
}) {
  const pathRef = useRef<SVGPathElement>(null);
  const point = useTransform(timeline.travel, (progress) => {
    const motionPath = pathRef.current;

    if (!motionPath) return { x: start[0], y: start[1] };

    const totalLength = motionPath.getTotalLength();
    if (totalLength === 0) return { x: start[0], y: start[1] };

    const position = motionPath.getPointAtLength(totalLength * progress);
    return { x: position.x, y: position.y };
  });
  const signalX = useTransform(point, ({ x }) => x);
  const signalY = useTransform(point, ({ y }) => y);

  return (
    <>
      <motion.path
        ref={pathRef}
        d={path}
        fill="none"
        stroke="var(--primary)"
        strokeLinecap="butt"
        strokeWidth="2.5"
        style={{ opacity: timeline.activity, pathLength: timeline.travel }}
      />

      <motion.circle
        cx={signalX}
        cy={signalY}
        data-homepage-handoff-signal={kind === "handoff" ? provider : undefined}
        data-homepage-motion-signal={kind === "omnichannel" ? provider : undefined}
        fill="var(--primary)"
        r="5"
        style={{ opacity: timeline.activity }}
      />
    </>
  );
}

function ProviderSignalRing({
  provider,
  timeline,
}: {
  provider: VisualAgentProviderFixtureId | VisualProviderFixtureId;
  timeline: SignalTimeline;
}) {
  const pingOpacity = useTransform(timeline.travel, [0, 0.16, 0.65, 1], [0, 0.55, 0.18, 0]);
  const pingScale = useTransform(timeline.travel, [0, 0.45, 1], [1, 1.16, 1.24]);

  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute -inset-1 z-0 rounded-full border border-primary/70"
      data-homepage-provider-ping={provider}
      style={{ opacity: timeline.activity }}
    >
      <motion.span
        className="absolute -inset-px rounded-full border border-primary/35"
        style={{ opacity: pingOpacity, scale: pingScale }}
      />
    </motion.span>
  );
}

function OrbitSignal({ orbitNode, signal }: { orbitNode: OrbitNode; signal: OmnichannelSignalSpec }) {
  const timeline = useSignalTimeline(signal, true);

  return (
    <>
      <svg
        aria-hidden
        className="absolute inset-0 hidden size-full sm:block"
        preserveAspectRatio="none"
        viewBox="0 0 1000 620"
      >
        <SyncedSignalPath
          kind="omnichannel"
          path={`M${orbitNode.desktop.node.join(" ")} L${orbitNode.desktop.target.join(" ")}`}
          provider={signal.provider}
          start={orbitNode.desktop.node}
          timeline={timeline}
        />
      </svg>

      <svg
        aria-hidden
        className="absolute inset-0 size-full sm:hidden"
        preserveAspectRatio="none"
        viewBox="0 0 600 760"
      >
        <SyncedSignalPath
          kind="omnichannel"
          path={`M${orbitNode.mobile.node.join(" ")} L${orbitNode.mobile.target.join(" ")}`}
          provider={signal.provider}
          start={orbitNode.mobile.node}
          timeline={timeline}
        />
      </svg>

      <span
        aria-hidden
        className="pointer-events-none absolute left-[var(--orbit-mobile-x)] top-[var(--orbit-mobile-y)] z-[11] size-12 -translate-1/2 sm:left-[var(--orbit-desktop-x)] sm:top-[var(--orbit-desktop-y)] sm:size-14"
        style={orbitPositionStyle(orbitNode)}
      >
        <ProviderSignalRing provider={signal.provider} timeline={timeline} />
      </span>
    </>
  );
}

function OrbitConnectors() {
  return (
    <>
      <svg
        aria-hidden
        className="absolute inset-0 hidden size-full sm:block"
        preserveAspectRatio="none"
        viewBox="0 0 1000 620"
      >
        {ORBIT_NODES.map(({ desktop, provider }) => (
          <path
            key={provider}
            d={`M${desktop.node.join(" ")} L${desktop.target.join(" ")}`}
            fill="none"
            stroke="var(--border-strong)"
            strokeLinecap="butt"
            strokeWidth="1.5"
          />
        ))}
      </svg>

      <svg
        aria-hidden
        className="absolute inset-0 size-full sm:hidden"
        preserveAspectRatio="none"
        viewBox="0 0 600 760"
      >
        {ORBIT_NODES.map(({ mobile, provider }) => (
          <path
            key={provider}
            d={`M${mobile.node.join(" ")} L${mobile.target.join(" ")}`}
            fill="none"
            stroke="var(--border-strong)"
            strokeLinecap="butt"
            strokeWidth="1.5"
          />
        ))}
      </svg>
    </>
  );
}

export function HomepageOmnichannelVisual({ className, label, labels, locale }: VisualProps & { label: string }) {
  const activeConversation = VISUAL_CONVERSATION_FIXTURES["gmail-rollout-next-steps"];
  const { ref, shouldAnimate } = useHomepageMotion<HTMLDivElement>();
  const { revision, scene: activeBurst } = useTimedSceneCycle(OMNICHANNEL_SIGNAL_BURSTS, shouldAnimate);

  return (
    <HomepageVisualArtboard
      className={cn("aspect-[4/5] min-h-[34rem] sm:aspect-[8/5] sm:min-h-0", className)}
      label={label}
      motionActive={shouldAnimate}
      motionRef={ref}
      name="omnichannel-record"
    >
      <OrbitConnectors />

      {shouldAnimate
        ? activeBurst.signals.map((signal) => {
            const orbitNode = ORBIT_NODES.find(({ provider }) => provider === signal.provider);

            return orbitNode ? (
              <OrbitSignal key={`${revision}-${signal.provider}`} orbitNode={orbitNode} signal={signal} />
            ) : null;
          })
        : null}

      {ORBIT_NODES.filter(({ provider }) => APPROVED_INBOX_PROVIDERS.has(provider)).map((orbitNode) => (
        <span
          key={orbitNode.provider}
          className="absolute left-[var(--orbit-mobile-x)] top-[var(--orbit-mobile-y)] z-10 size-12 -translate-1/2 sm:left-[var(--orbit-desktop-x)] sm:top-[var(--orbit-desktop-y)] sm:size-14"
          data-homepage-provider-shell={orbitNode.provider}
          style={orbitPositionStyle(orbitNode)}
        >
          <span className="relative z-10 grid size-full place-items-center rounded-full border border-border bg-card shadow-sm">
            <ProviderMark provider={orbitNode.provider} size={22} />
          </span>
        </span>
      ))}

      <div className="absolute left-1/2 top-[27%] z-20 w-[58%] -translate-x-1/2 sm:top-[29%] sm:w-[45%]">
        <div
          className="relative overflow-hidden rounded-card border border-border bg-card p-4 shadow-xl shadow-black/10 dark:shadow-black/30 sm:p-6"
          data-homepage-motion-phase="signal-to-record"
        >
          <p className="text-meta">{labels.customerRecord}</p>

          <div className="mt-3 flex items-center gap-3">
            <PersonAvatar person="anna-mueller" size={44} />

            <div className="min-w-0">
              <p className="truncate font-medium">{VISUAL_PERSON_FIXTURES["anna-mueller"].name}</p>

              <p className="mt-1 text-xs text-muted-foreground">{labels.connectedRecord}</p>
            </div>
          </div>

          <div
            className="-mx-4 mt-5 border-t border-border px-4 pt-4 sm:-mx-6 sm:px-6"
            data-homepage-rules="full-bleed"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[9px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
                {labels.latestActivity}
              </p>

              <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                <span aria-hidden className="size-1.5 rounded-full bg-warning" />

                {labels.open}
              </span>
            </div>

            <div className="mt-3 flex min-w-0 items-center gap-2">
              <ProviderIdentity className="text-[10px]" iconSize={16} provider={activeConversation.provider} />

              <span aria-hidden className="h-4 w-px shrink-0 bg-border" />

              <p className="min-w-0 truncate text-[11px] font-medium">{activeConversation.localizedSubject[locale]}</p>
            </div>

            <div aria-hidden className="mt-2 space-y-1.5 pl-6">
              <div className="h-1.5 w-full rounded-full bg-placeholder" />

              <div className="h-1.5 w-[68%] rounded-full bg-muted" />
            </div>
          </div>
        </div>
      </div>
    </HomepageVisualArtboard>
  );
}

const HANDOFF_AGENT_PROVIDERS = [
  {
    desktop: "sm:left-[6%] sm:right-auto sm:top-[18%]",
    desktopPoint: [232, 90],
    mobile: "left-[6%] top-[10%]",
    mobileJustify: "justify-end",
    mobilePoint: [264, 76],
    provider: "chatgpt",
  },
  {
    desktop: "sm:left-[6%] sm:right-auto sm:top-[36%]",
    desktopPoint: [232, 180],
    mobile: "right-[6%] top-[10%]",
    mobileJustify: "justify-start",
    mobilePoint: [336, 76],
    provider: "claude",
  },
  {
    desktop: "sm:left-[6%] sm:right-auto sm:top-[54%]",
    desktopPoint: [232, 270],
    mobile: "left-[6%] top-[22%]",
    mobileJustify: "justify-end",
    mobilePoint: [264, 167],
    provider: "cursor",
  },
  {
    desktop: "sm:left-[6%] sm:right-auto sm:top-[72%]",
    desktopPoint: [232, 360],
    mobile: "right-[6%] top-[22%]",
    mobileJustify: "justify-start",
    mobilePoint: [336, 167],
    provider: "gemini",
  },
] as const satisfies readonly {
  desktop: string;
  desktopPoint: OrbitPoint;
  mobile: string;
  mobileJustify: string;
  mobilePoint: OrbitPoint;
  provider: VisualAgentProviderFixtureId;
}[];

type HandoffProvider = (typeof HANDOFF_AGENT_PROVIDERS)[number];

type HandoffSignalSpec = {
  delayMs: number;
  durationMs: number;
  ease: SignalEase;
  provider: VisualAgentProviderFixtureId;
};

type HandoffSignalScene = {
  durationMs: number;
  signal: HandoffSignalSpec;
};

const HANDOFF_SIGNAL_SEQUENCE = [
  {
    durationMs: 2_900,
    signal: {
      delayMs: 80,
      durationMs: 2_200,
      ease: "settle",
      provider: "chatgpt",
    },
  },
  {
    durationMs: 3_300,
    signal: {
      delayMs: 240,
      durationMs: 2_450,
      ease: "drift",
      provider: "cursor",
    },
  },
  {
    durationMs: 2_700,
    signal: {
      delayMs: 0,
      durationMs: 2_100,
      ease: "swift",
      provider: "claude",
    },
  },
  {
    durationMs: 3_400,
    signal: {
      delayMs: 360,
      durationMs: 2_350,
      ease: "settle",
      provider: "chatgpt",
    },
  },
  {
    durationMs: 3_000,
    signal: {
      delayMs: 120,
      durationMs: 2_250,
      ease: "drift",
      provider: "gemini",
    },
  },
  {
    durationMs: 3_200,
    signal: {
      delayMs: 260,
      durationMs: 2_300,
      ease: "swift",
      provider: "cursor",
    },
  },
  {
    durationMs: 2_850,
    signal: {
      delayMs: 40,
      durationMs: 2_150,
      ease: "settle",
      provider: "claude",
    },
  },
  {
    durationMs: 3_500,
    signal: {
      delayMs: 200,
      durationMs: 2_500,
      ease: "drift",
      provider: "gemini",
    },
  },
] as const satisfies readonly HandoffSignalScene[];

function HandoffSignal({
  layout,
  provider,
  timeline,
}: {
  layout: "desktop" | "mobile";
  provider: HandoffProvider;
  timeline: SignalTimeline;
}) {
  const [startX, startY] = layout === "desktop" ? provider.desktopPoint : provider.mobilePoint;
  const path =
    layout === "desktop"
      ? `M${startX} ${startY} C285 ${startY} 285 225 320 225 H350`
      : `M${startX} ${startY} H300 V243`;

  return (
    <SyncedSignalPath
      kind="handoff"
      path={path}
      provider={provider.provider}
      start={layout === "desktop" ? provider.desktopPoint : provider.mobilePoint}
      timeline={timeline}
    />
  );
}

export function HomepageHandoffVisual({ className, labels }: VisualProps) {
  const { ref, shouldAnimate } = useHomepageMotion<HTMLDivElement>();
  const { revision, scene: activeScene } = useTimedSceneCycle(HANDOFF_SIGNAL_SEQUENCE, shouldAnimate);
  const activeSignal = activeScene.signal;
  const handoffTimeline = useSignalTimeline(activeSignal, shouldAnimate);
  const activeProvider = HANDOFF_AGENT_PROVIDERS.find(({ provider }) => provider === activeSignal.provider);

  if (!activeProvider) return null;

  return (
    <HomepageVisualArtboard
      className={cn("aspect-[4/5] min-h-[33rem] sm:aspect-[8/5] sm:min-h-[25rem] xl:min-h-0", className)}
      label={`${labels.draft}. ${labels.humanDecision}.`}
      motionActive={shouldAnimate}
      motionRef={ref}
      name="human-handoff"
    >
      <svg
        aria-hidden
        className="absolute inset-0 z-[1] hidden size-full sm:block"
        preserveAspectRatio="none"
        viewBox="0 0 800 500"
      >
        <path
          d={`${HANDOFF_AGENT_PROVIDERS.map(({ desktopPoint: [, y] }) => `M232 ${y} C285 ${y} 285 225 320 225`).join(" ")} M320 225 H350`}
          fill="none"
          stroke={COMPOUND_CONNECTOR_STROKE}
          strokeLinecap="butt"
          strokeWidth="1.5"
        />

        {shouldAnimate ? (
          <HandoffSignal
            key={`${revision}-desktop-${activeProvider.provider}`}
            layout="desktop"
            provider={activeProvider}
            timeline={handoffTimeline}
          />
        ) : null}
      </svg>

      <svg
        aria-hidden
        className="absolute inset-0 z-[1] size-full sm:hidden"
        preserveAspectRatio="none"
        viewBox="0 0 600 760"
      >
        <path
          d="M264 76 H300 M336 76 H300 M264 167 H300 M336 167 H300 M300 76 V243"
          fill="none"
          stroke={COMPOUND_CONNECTOR_STROKE}
          strokeLinecap="butt"
          strokeWidth="1.5"
        />

        {shouldAnimate ? (
          <HandoffSignal
            key={`${revision}-mobile-${activeProvider.provider}`}
            layout="mobile"
            provider={activeProvider}
            timeline={handoffTimeline}
          />
        ) : null}
      </svg>

      {HANDOFF_AGENT_PROVIDERS.map((provider) => {
        const isActive = shouldAnimate && activeSignal.provider === provider.provider;

        return (
          <div
            key={provider.provider}
            className={cn(
              "absolute z-10 flex w-[38%] -translate-y-1/2 sm:w-[23%] sm:justify-end",
              provider.mobile,
              provider.mobileJustify,
              provider.desktop,
            )}
          >
            <div
              className="relative flex w-fit max-w-full items-center whitespace-nowrap rounded-full border border-border bg-card px-3 py-2 shadow-sm"
              data-homepage-handoff-provider={provider.provider}
            >
              {isActive ? <ProviderSignalRing provider={provider.provider} timeline={handoffTimeline} /> : null}

              <NativeAgentProviderIdentity
                className="relative z-10 shrink-0 text-[10px] sm:text-xs"
                iconSize={18}
                provider={provider.provider}
              />
            </div>
          </div>
        );
      })}

      <div
        className="absolute left-[8%] top-[32%] z-20 w-[84%] overflow-hidden rounded-card border border-border bg-card p-5 shadow-xl shadow-black/10 dark:shadow-black/30 sm:left-[43.75%] sm:top-[10%] sm:w-[52.25%] sm:p-7"
        data-homepage-motion-phase="provider-to-draft"
      >
        <motion.span
          key={shouldAnimate ? `${revision}-${activeSignal.provider}` : "static"}
          aria-hidden
          animate={
            shouldAnimate
              ? {
                  opacity: PROVIDER_ARRIVAL_OPACITY,
                  scale: PROVIDER_ARRIVAL_SCALE,
                }
              : { opacity: 0, scale: 1 }
          }
          className="pointer-events-none absolute inset-0 rounded-card border border-primary"
          data-homepage-draft-arrival-provider={activeSignal.provider}
          initial={{ opacity: 0, scale: 1 }}
          transition={
            shouldAnimate
              ? {
                  delay: (activeSignal.delayMs + activeSignal.durationMs * PROVIDER_ARRIVAL_DELAY_RATIO) / 1_000,
                  duration: (activeSignal.durationMs / 1_000) * PROVIDER_ARRIVAL_DURATION_RATIO,
                  ease: SIGNAL_EASES[activeSignal.ease],
                  times: PROVIDER_ARRIVAL_TIMES,
                }
              : { duration: 0 }
          }
        />

        <div
          className="-mx-5 flex items-center justify-between gap-3 border-b border-border px-5 pb-4 sm:-mx-7 sm:px-7"
          data-homepage-rules="full-bleed"
        >
          <span className="rounded-md bg-foreground/5 px-2.5 py-1 text-[11px] font-medium">{labels.draft}</span>

          <ProviderIdentity className="text-[10px]" iconSize={16} provider="linkedin" />
        </div>

        <div className="mt-4">
          <p className="text-meta mb-2">{labels.recipient}</p>

          <PersonIdentity person="leon-becker" size={30} />
        </div>

        <div aria-hidden className="mt-5 space-y-2.5">
          {HANDOFF_DRAFT_LINES.map((line) => (
            <div key={line} className={cn("h-1.5 rounded-full", line)} />
          ))}
        </div>

        <div
          className="-mx-5 mt-6 flex items-center justify-between gap-3 border-t border-border px-5 pt-4 sm:-mx-7 sm:px-7"
          data-homepage-rules="full-bleed"
        >
          <span className="min-w-0" data-homepage-motion-phase="human-review">
            <span className="text-[9px] text-muted-foreground">{labels.humanDecision}</span>

            <PersonIdentity className="mt-1 max-w-32" person="max-bergmann" size={28} />
          </span>

          <span className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
            {labels.reviewAndSend}

            <Send aria-hidden className="size-3.5" />
          </span>
        </div>
      </div>
    </HomepageVisualArtboard>
  );
}

const currencyFormatters = new Map<ContentLocale, Intl.NumberFormat>();

function formatMoney(locale: ContentLocale, amount: number) {
  let formatter = currencyFormatters.get(locale);

  if (!formatter) {
    formatter = new Intl.NumberFormat(formattingTagFor(locale), {
      currency: "EUR",
      maximumFractionDigits: 0,
      notation: "compact",
      style: "currency",
    });
    currencyFormatters.set(locale, formatter);
  }

  return formatter.format(amount);
}

function PipelineCard({
  className,
  labels,
  locale,
  record,
}: {
  className?: string;
  labels: HomepageVisualLabels;
  locale: ContentLocale;
  record: VisualRecordFixtureId;
}) {
  const fixture = VISUAL_RECORD_FIXTURES[record];

  return (
    <div
      className={cn("overflow-hidden rounded-xl border border-border bg-card p-3 shadow-sm", className)}
      data-native-record={record}
    >
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between">
        <p className="line-clamp-2 text-[11px] leading-snug font-medium sm:text-xs">{fixture.name}</p>

        <NativeStatusBadge className="inline-flex" locale={locale} status={fixture.status} />
      </div>

      <div
        className="-mx-3 mt-3 grid grid-cols-1 gap-2 border-y border-border p-3 sm:grid-cols-2"
        data-homepage-rules="full-bleed"
      >
        <div>
          <p className="text-[8px] leading-tight text-muted-foreground uppercase sm:text-[9px]">{labels.dealValue}</p>

          <p className="mt-1 text-[10px] font-medium tabular-nums sm:text-xs">
            {formatMoney(locale, fixture.totalValue)}
          </p>
        </div>

        <div>
          <p className="text-[8px] leading-tight text-muted-foreground uppercase sm:text-[9px]">
            {labels.weightedValue}
          </p>

          <p className="mt-1 text-[10px] font-medium tabular-nums sm:text-xs">
            {formatMoney(locale, fixture.weightedValue)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <PersonAvatar decorative person={fixture.assignee} size={24} />

        <span className="min-w-0 truncate text-[9px] text-muted-foreground">
          {VISUAL_PERSON_FIXTURES[fixture.assignee].name}
        </span>
      </div>
    </div>
  );
}

const PIPELINE_RECORDS = {
  active: "deal-digital-customer-platform",
  lost: "deal-process-automation",
  won: "deal-crm-rollout",
} as const satisfies Record<string, VisualRecordFixtureId>;

export function HomepagePipelineVisual({ className, labels, locale }: VisualProps) {
  const { ref, shouldAnimate } = useHomepageMotion<HTMLDivElement>();

  return (
    <HomepageVisualArtboard
      className={cn("aspect-[4/5] min-h-[35rem] sm:aspect-[8/5] sm:min-h-0", className)}
      label={`${labels.pipeline}: ${VISUAL_RECORD_FIXTURES[PIPELINE_RECORDS.active].name}`}
      motionActive={shouldAnimate}
      motionRef={ref}
      name="pipeline"
    >
      <div className="absolute inset-x-[5%] inset-y-[8%] grid grid-cols-3 gap-2 sm:inset-x-[7%] sm:gap-4">
        {[
          { label: labels.open, status: "deal-open" as const },
          { label: labels.won, status: "deal-won" as const },
          { label: labels.lost, status: "deal-lost" as const },
        ].map(({ label, status }) => (
          <div
            key={status}
            className="relative min-w-0 overflow-hidden border-l border-border pl-2 sm:pl-4"
            data-homepage-pipeline-column={status}
          >
            <div
              className="relative z-10 -ml-2 flex items-center gap-2 border-b border-border pb-3 pl-2 sm:-ml-4 sm:pl-4"
              data-homepage-rules="full-bleed"
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  status === "deal-open" && "bg-warning",
                  status === "deal-won" && "bg-success",
                  status === "deal-lost" && "bg-destructive",
                )}
              />

              <span className="truncate text-[10px] font-medium sm:text-xs">{label}</span>
            </div>
          </div>
        ))}
      </div>

      {[
        {
          className: "left-[38%] top-[20%] w-[25%] sm:left-[39%]",
          record: PIPELINE_RECORDS.won,
          status: "deal-won" as const,
        },
        {
          className: "right-[7%] top-[28%] w-[26%]",
          record: PIPELINE_RECORDS.lost,
          status: "deal-lost" as const,
        },
      ].map(({ className: cardClassName, record, status }) => (
        <div
          key={status}
          className={cn("absolute z-10 opacity-75 saturate-50", cardClassName)}
          data-homepage-pipeline-background-card={status}
        >
          <PipelineCard labels={labels} locale={locale} record={record} />
        </div>
      ))}

      <div className="pointer-events-none absolute inset-y-[8%] left-[8%] z-20 w-[27%] sm:left-[9%] sm:w-[25%]">
        <span className="absolute left-0 top-[52.4%] grid w-full sm:top-[45.2%]">
          <motion.span
            aria-hidden
            animate={shouldAnimate ? { opacity: PIPELINE_SOURCE_OUTLINE_OPACITY } : { opacity: 0 }}
            className="pointer-events-none relative z-10 col-start-1 row-start-1 rounded-xl border border-dashed border-input bg-card/50"
            data-homepage-pipeline-source-footprint="deal-open"
            initial={false}
            style={{ transform: `translateY(${PIPELINE_DRAG_Y[0]}px)` }}
            transition={
              shouldAnimate
                ? {
                    ...PIPELINE_LOOP_TRANSITION,
                    times: PIPELINE_DRAG_TIMES,
                  }
                : { duration: 0 }
            }
          />

          <motion.div
            key={shouldAnimate ? "pipeline-active" : "pipeline-static"}
            animate={
              shouldAnimate
                ? {
                    x: PIPELINE_DRAG_X,
                    y: PIPELINE_DRAG_Y,
                  }
                : { x: "0%", y: PIPELINE_DRAG_Y[0] }
            }
            className="relative z-20 col-start-1 row-start-1"
            data-homepage-motion-phase="pipeline-drag-preview"
            initial={shouldAnimate ? { x: "0%", y: PIPELINE_DRAG_Y[0] } : false}
            transition={shouldAnimate ? { ...PIPELINE_LOOP_TRANSITION, times: PIPELINE_DRAG_TIMES } : { duration: 0 }}
          >
            <PipelineCard
              className="border-border shadow-xl shadow-black/10 dark:shadow-black/30"
              labels={labels}
              locale={locale}
              record={PIPELINE_RECORDS.active}
            />

            <span aria-hidden data-homepage-drag-cursor className="absolute -bottom-5 -right-2 z-40">
              <MousePointer2 className="size-7 fill-card text-foreground drop-shadow-md sm:size-8" strokeWidth={1.5} />
            </span>
          </motion.div>
        </span>
      </div>
    </HomepageVisualArtboard>
  );
}
