"use client";

import type { ReactNode } from "react";

import {
  AtSign,
  Blocks,
  BookOpen,
  Check,
  Globe2,
  Languages,
  Link2,
  ListChecks,
  Mail,
  Plus,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { NativeAgentProviderIdentity } from "@/components/marketing/visuals/native-visual-primitives";
import { COMPOUND_CONNECTOR_STROKE } from "@/components/marketing/visuals/story-visual-layout";
import { VisualArtboard } from "@/components/marketing/visuals/visual-artboard";
import { GridPattern } from "@/components/shared/grid-pattern";
import { OverlappingStack } from "@/components/shared/overlapping-stack";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/core/utils/cn";

import type { WizardStep } from "./onboarding-wizard.store";

type Step = WizardStep;
const STEP_ICONS = { profile: UserRound, setup: Blocks, invite: UsersRound, ai: Sparkles };

const NARROW_CONNECTOR = "M40 32C68 32 68 56 96 56";
const SOURCE_PAIR_CONNECTOR = "M40 32C76 32 76 64 112 64M40 96C76 96 76 64 112 64M112 64H144";
const AGENT_PAIR_CONNECTOR = "M96 32C136 32 136 64 176 64M96 96C136 96 136 64 176 64M176 64H208";
const WIDE_SCENE_CLASS = { 320: "sm:w-80", 384: "sm:w-96" } as const;

function Scene({
  children,
  connector,
  width,
}: {
  children: ReactNode;
  connector: string;
  width: keyof typeof WIDE_SCENE_CLASS;
}) {
  const placements = [
    { className: "sm:hidden", d: NARROW_CONNECTOR, viewBox: "0 0 256 112" },
    { className: "hidden sm:block", d: connector, viewBox: `0 0 ${width} 128` },
  ];

  return (
    <div className={cn("relative h-28 w-64 sm:h-32", WIDE_SCENE_CLASS[width])}>
      {placements.map(({ className, d, viewBox }) => (
        <svg key={viewBox} className={cn("absolute inset-0 size-full", className)} fill="none" viewBox={viewBox}>
          <path
            d={d}
            stroke={COMPOUND_CONNECTOR_STROKE}
            strokeLinecap="butt"
            strokeWidth="1.25"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ))}

      {children}
    </div>
  );
}

function SourceMark({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span
      className={cn(
        "absolute z-10 grid size-10 place-items-center rounded-full border border-border bg-card shadow-sm",
        className,
      )}
    >
      <span className="grid size-8 place-items-center rounded-full border border-border bg-background text-muted-foreground">
        {children}
      </span>
    </span>
  );
}

function SourcePair({ first, second }: { first: ReactNode; second: ReactNode }) {
  return (
    <>
      <SourceMark className="top-3 left-0">{first}</SourceMark>

      <SourceMark className="bottom-3 left-0 hidden sm:grid">{second}</SourceMark>
    </>
  );
}

function FocalCard({ children }: { children: ReactNode }) {
  return (
    <div className="absolute top-1/2 right-0 z-20 w-40 -translate-y-1/2 product-card rounded-card p-4 sm:w-44">
      {children}
    </div>
  );
}

function TextLines() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="h-2 w-full rounded-full bg-placeholder" />

      <div className="h-2 w-3/5 rounded-full bg-muted" />
    </div>
  );
}

function FocalIdentity({ children }: { children: ReactNode }) {
  return (
    <FocalCard>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
          {children}
        </span>

        <TextLines />
      </div>
    </FocalCard>
  );
}

function ProfileScene() {
  return (
    <Scene connector={SOURCE_PAIR_CONNECTOR} width={320}>
      <SourcePair first={<Languages className="size-4" />} second={<AtSign className="size-4" />} />

      <FocalIdentity>
        <UserRound className="size-5" />
      </FocalIdentity>
    </Scene>
  );
}

function SetupScene() {
  return (
    <Scene connector={SOURCE_PAIR_CONNECTOR} width={320}>
      <SourcePair first={<Globe2 className="size-4" />} second={<ListChecks className="size-4" />} />

      <FocalCard>
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2].map((block) => (
            <div key={block} className="h-7 rounded-lg bg-placeholder" />
          ))}

          <div className="grid h-7 place-items-center rounded-lg border border-primary/25 bg-primary/6 text-primary">
            <Plus className="size-3.5" />
          </div>
        </div>
      </FocalCard>
    </Scene>
  );
}

function InviteScene() {
  return (
    <Scene connector={SOURCE_PAIR_CONNECTOR} width={320}>
      <SourcePair first={<Link2 className="size-4" />} second={<Mail className="size-4" />} />

      <FocalCard>
        <div className="flex items-center gap-2">
          <OverlappingStack
            badgeKey={(member) => member}
            badges={["first", "second", "third"]}
            renderBadge={() => <Avatar fallback="" />}
            renderOverflow={() => null}
          />

          <span className="grid size-6 place-items-center rounded-full border border-primary/25 bg-primary/6 text-primary">
            <Plus className="size-3.5" />
          </span>
        </div>

        <div className="mt-3">
          <TextLines />
        </div>
      </FocalCard>
    </Scene>
  );
}

function AiScene() {
  return (
    <Scene connector={AGENT_PAIR_CONNECTOR} width={384}>
      <SourceMark className="top-3 left-0 sm:hidden">
        <AiClientLogo className="size-4" provider="claude" />
      </SourceMark>

      <NativeAgentProviderIdentity
        className="absolute top-3 left-0 z-10 hidden h-10 w-24 justify-center rounded-full border border-border bg-card text-xs shadow-sm sm:inline-flex"
        iconSize={16}
        provider="claude"
      />

      <span className="absolute bottom-3 left-0 z-10 hidden h-10 w-24 items-center justify-center gap-2.5 rounded-full border border-border bg-card shadow-sm sm:flex">
        {(["chatgpt", "cursor", "gemini"] as const).map((provider) => (
          <AiClientLogo key={provider} className="size-3.5 opacity-75" provider={provider} />
        ))}
      </span>

      <FocalIdentity>
        <BookOpen className="size-5" />
      </FocalIdentity>
    </Scene>
  );
}

function StepScene({ step }: { step: Step }) {
  switch (step) {
    case "profile":
      return <ProfileScene />;
    case "setup":
      return <SetupScene />;
    case "invite":
      return <InviteScene />;
    case "ai":
      return <AiScene />;
  }
}

export function OnboardingArtwork({ step }: { step: Step }) {
  return (
    <VisualArtboard aria-hidden="true" className="h-36 shrink-0 rounded-xl sm:h-40" role="presentation">
      <GridPattern className="opacity-45" density="compact" />

      <div
        key={step}
        className="absolute inset-0 grid place-items-center animate-page-result-in motion-reduce:animate-none"
      >
        <StepScene step={step} />
      </div>
    </VisualArtboard>
  );
}
export function OnboardingMilestones({
  current,
  labels,
  steps,
}: {
  current: number;
  labels: Record<Step, string>;
  steps: readonly Step[];
}) {
  return (
    <ol className="flex items-start">
      {steps.map((step, index) => {
        const Icon = STEP_ICONS[step];
        return (
          <li
            key={step}
            aria-current={index === current ? "step" : undefined}
            className="relative flex flex-1 flex-col items-center gap-2"
          >
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn("absolute top-4 left-1/2 h-px w-full", index < current ? "bg-primary/50" : "bg-border")}
              />
            )}

            <span
              aria-hidden="true"
              className={cn(
                "relative flex size-8 items-center justify-center rounded-full border bg-card",
                index <= current ? "border-primary/30 text-primary" : "border-border text-muted-foreground",
                index === current && "ring-4 ring-primary/10",
              )}
            >
              {index < current ? <Check className="size-4" /> : <Icon className="size-4" />}
            </span>

            <span
              className={cn("text-xs", index === current ? "font-medium text-foreground" : "text-muted-foreground")}
            >
              {labels[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
