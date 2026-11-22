"use client";

import type { ReactNode } from "react";

import {
  AtSign,
  Blocks,
  BookOpen,
  Bot,
  Check,
  ClipboardCheck,
  Compass,
  Languages,
  LayoutTemplate,
  Mail,
  Plug,
  UserRound,
  UsersRound,
} from "lucide-react";

import { MateOrb } from "@/components/mate/mate-orb";
import { COMPOUND_CONNECTOR_STROKE } from "@/components/marketing/visuals/story-visual-layout";
import { VisualArtboard } from "@/components/marketing/visuals/visual-artboard";
import { GridPattern } from "@/components/shared/grid-pattern";
import { cn } from "@/core/utils/cn";

import type { WizardStep } from "./onboarding-wizard.store";
import type { MilestoneStep } from "./onboarding-wizard-flow";

type SceneStep = Extract<WizardStep, "profile" | "goal">;
const STEP_ICONS = {
  profile: UserRound,
  goal: Compass,
  playbook: BookOpen,
  setup: Blocks,
  invite: UsersRound,
  channel: Mail,
  ai: Plug,
  template: LayoutTemplate,
  prompt: ClipboardCheck,
};

const NARROW_CONNECTOR = "M40 32C68 32 68 56 96 56";
const SOURCE_PAIR_CONNECTOR = "M40 32C76 32 76 64 112 64M40 96C76 96 76 64 112 64M112 64H144";

function Scene({ children }: { children: ReactNode }) {
  const placements = [
    { className: "sm:hidden", d: NARROW_CONNECTOR, viewBox: "0 0 256 112" },
    { className: "hidden sm:block", d: SOURCE_PAIR_CONNECTOR, viewBox: "0 0 320 128" },
  ];

  return (
    <div className="relative h-28 w-64 sm:h-32 sm:w-80">
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
    <Scene>
      <SourcePair first={<Languages className="size-4" />} second={<AtSign className="size-4" />} />

      <FocalIdentity>
        <UserRound className="size-5" />
      </FocalIdentity>
    </Scene>
  );
}

function GoalScene() {
  return (
    <Scene>
      <SourcePair first={<Bot className="size-4" />} second={<MateOrb className="size-5" />} />

      <FocalIdentity>
        <LayoutTemplate className="size-5" />
      </FocalIdentity>
    </Scene>
  );
}

function StepScene({ step }: { step: SceneStep }) {
  switch (step) {
    case "profile":
      return <ProfileScene />;
    case "goal":
      return <GoalScene />;
  }
}

export function OnboardingArtwork({ step, className }: { step: SceneStep; className?: string }) {
  return (
    <VisualArtboard
      aria-hidden="true"
      className={cn("h-32 shrink-0 rounded-xl sm:h-40", className)}
      role="presentation"
      tone="ink"
    >
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
  progressText,
  steps,
}: {
  current: number;
  labels: Record<MilestoneStep, string>;
  progressText: string;
  steps: readonly MilestoneStep[];
}) {
  const currentStep = steps[current];

  return (
    <div className="flex flex-col gap-2">
      <p aria-hidden="true" className="text-xs text-muted-foreground lg:hidden">
        {progressText}

        {currentStep ? <span className="font-medium text-foreground">{` · ${labels[currentStep]}`}</span> : null}
      </p>

      <MilestoneSteps current={current} labels={labels} steps={steps} />
    </div>
  );
}

function MilestoneSteps({
  current,
  labels,
  steps,
}: {
  current: number;
  labels: Record<MilestoneStep, string>;
  steps: readonly MilestoneStep[];
}) {
  return (
    <ol className="flex items-start">
      {steps.map((step, index) => {
        const Icon = STEP_ICONS[step];
        return (
          <li
            key={step}
            aria-current={index === current ? "step" : undefined}
            className="relative flex min-w-0 flex-1 flex-col items-center gap-2"
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
              className={cn(
                "max-w-full px-1 text-center text-xs text-balance max-lg:sr-only",
                index === current ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {labels[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
