import { BookOpen, Check, Globe2, Sparkles, UserRound, UsersRound } from "lucide-react";

import { cn } from "@/core/utils/cn";

import { WIZARD_STEPS } from "./onboarding-wizard.store";

type Step = (typeof WIZARD_STEPS)[number];
const STEP_ICONS = { profile: UserRound, wiki: BookOpen, invite: UsersRound, ai: Sparkles };

export function OnboardingArtwork({
  step,
  complete = false,
  pageTitles = [],
}: {
  step: Step;
  complete?: boolean;
  pageTitles?: string[];
}) {
  const Icon = STEP_ICONS[step];
  return (
    <div aria-hidden="true" className="relative flex h-28 items-center justify-center overflow-hidden sm:h-36">
      <div className="absolute h-24 w-64 rounded-full bg-primary/10 blur-3xl" />

      <svg className="absolute h-32 w-80 text-primary/25" fill="none" viewBox="0 0 320 128">
        <ellipse cx="160" cy="64" rx="140" ry="48" stroke="currentColor" strokeDasharray="3 7" />

        <path d="M32 64h256M160 8v112" stroke="currentColor" strokeDasharray="2 8" />

        <circle cx="32" cy="64" fill="currentColor" r="3" />

        <circle cx="288" cy="64" fill="currentColor" r="3" />
      </svg>

      <div key={step} className="relative flex items-center gap-5 animate-page-result-in motion-reduce:animate-none">
        <div className="flex h-16 w-20 -rotate-12 flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm sm:h-20 sm:w-24">
          {step === "wiki" ? <Globe2 className="size-5 text-primary" /> : <UserRound className="size-5 text-primary" />}

          <div className="h-1.5 w-9 rounded-full bg-primary/20" />

          <div className="h-1.5 w-6 rounded-full bg-muted-foreground/20" />
        </div>

        <div className="relative flex size-16 items-center justify-center rounded-2xl border border-primary/20 bg-card text-primary shadow-lg shadow-primary/10 sm:size-20">
          <Icon className="size-7 sm:size-9" strokeWidth={1.5} />

          {complete && (
            <span className="absolute -right-2 -bottom-2 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground animate-page-result-in motion-reduce:animate-none">
              <Check className="size-4" />
            </span>
          )}
        </div>

        <div className="relative h-16 w-20 rotate-12 sm:h-20 sm:w-24">
          <div className="absolute inset-0 translate-x-2 -translate-y-2 rounded-xl border border-primary/20 bg-card" />

          <div className="relative flex size-full flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
            {step === "invite" ? (
              <UsersRound className="size-5 text-primary" />
            ) : (
              <BookOpen className="size-5 text-primary" />
            )}

            {complete && pageTitles[0] ? (
              <span className="truncate text-xs text-foreground">{pageTitles[0]}</span>
            ) : (
              <div className="h-1.5 w-full rounded-full bg-primary/20" />
            )}

            <div className="h-1.5 w-2/3 rounded-full bg-muted-foreground/20" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function OnboardingMilestones({ current, labels }: { current: number; labels: Record<Step, string> }) {
  return (
    <ol className="flex items-start">
      {WIZARD_STEPS.map((step, index) => {
        const Icon = STEP_ICONS[step];
        return (
          <li
            key={step}
            aria-current={index === current ? "step" : undefined}
            className="relative flex flex-1 flex-col items-center gap-2"
          >
            {index < WIZARD_STEPS.length - 1 && (
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
