import type { ReactNode } from "react";

import {
  ArrowRight,
  BookOpen,
  Building2,
  Check,
  Globe2,
  Mail,
  MapPin,
  MessageSquare,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";

import { cn } from "@/core/utils/cn";

import { WIZARD_STEPS } from "./onboarding-wizard.store";

type Step = (typeof WIZARD_STEPS)[number];
const STEP_ICONS = { profile: UserRound, wiki: BookOpen, invite: UsersRound, ai: Sparkles };

function PaperLines() {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="h-1.5 w-full rounded-full bg-primary/20" />

      <span className="h-1.5 w-2/3 rounded-full bg-muted-foreground/20" />
    </div>
  );
}

function ArtTile({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cn("relative rounded-xl border border-border bg-card text-primary shadow-sm", className)}>
      {children}
    </div>
  );
}

function StepScene({ step, complete, pageTitles }: { step: Step; complete: boolean; pageTitles: string[] }) {
  switch (step) {
    case "profile":
      return (
        <div className="relative flex w-64 items-center justify-center">
          <ArtTile className="absolute -top-3 right-4 flex size-10 rotate-12 items-center justify-center">
            <Mail className="size-5" />
          </ArtTile>

          <ArtTile className="w-44 -rotate-3 p-3.5">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                <UserRound className="size-6" strokeWidth={1.5} />
              </span>

              <span className="h-2 w-16 rounded-full bg-primary/25" />
            </div>

            <PaperLines />
          </ArtTile>

          <ArtTile className="absolute -bottom-3 left-3 flex size-10 -rotate-12 items-center justify-center">
            <MapPin className="size-5" />
          </ArtTile>
        </div>
      );
    case "wiki":
      return (
        <div className="flex items-center gap-4">
          <ArtTile className="w-24 -rotate-6 overflow-hidden">
            <div className="flex gap-1 border-b border-border p-2">
              <span className="size-1 rounded-full bg-primary/40" />

              <span className="size-1 rounded-full bg-primary/25" />

              <span className="size-1 rounded-full bg-primary/15" />
            </div>

            <div className="flex flex-col gap-2 p-3">
              <Globe2 className="size-6" strokeWidth={1.5} />

              <PaperLines />
            </div>
          </ArtTile>

          <ArrowRight className="size-5 text-primary/60" strokeWidth={1.5} />

          <div className="relative w-24 rotate-6">
            <ArtTile className="absolute inset-0 translate-x-3 -translate-y-3 rotate-6" />

            <ArtTile className="absolute inset-0 translate-x-1.5 -translate-y-1.5 rotate-3" />

            <ArtTile className="flex flex-col gap-3 p-3">
              <BookOpen className="size-7" strokeWidth={1.5} />

              {complete && pageTitles[0] ? (
                <span className="truncate text-xs text-foreground">{pageTitles[0]}</span>
              ) : (
                <PaperLines />
              )}
            </ArtTile>

            {complete && (
              <span className="absolute -right-2 -bottom-2 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground animate-page-result-in motion-reduce:animate-none">
                <Check className="size-4" />
              </span>
            )}
          </div>
        </div>
      );
    case "invite":
      return (
        <div className="relative flex h-28 w-64 items-center justify-center">
          <svg className="absolute inset-0 size-full text-primary/35" fill="none" viewBox="0 0 256 112">
            <path d="M45 30L128 60L211 30M128 60v38" stroke="currentColor" strokeDasharray="4 4" strokeWidth="1.5" />
          </svg>

          <ArtTile className="absolute top-0 left-6 flex size-11 -rotate-12 items-center justify-center rounded-full">
            <UserRound className="size-5" />
          </ArtTile>

          <ArtTile className="absolute top-0 right-6 flex size-11 rotate-12 items-center justify-center rounded-full">
            <UserRound className="size-5" />
          </ArtTile>

          <ArtTile className="flex size-16 items-center justify-center border-primary/25 shadow-lg shadow-primary/10">
            <Building2 className="size-8" strokeWidth={1.5} />
          </ArtTile>

          <ArtTile className="absolute -bottom-1 flex h-8 w-14 items-center justify-center rounded-full">
            <UsersRound className="size-5" />
          </ArtTile>
        </div>
      );
    case "ai":
      return (
        <div className="relative flex h-28 w-64 items-center justify-center">
          <svg className="absolute inset-0 size-full text-primary/35" fill="none" viewBox="0 0 256 112">
            <path
              d="M38 28C90 28 78 56 128 56S170 84 218 84M38 84C90 84 78 56 128 56S170 28 218 28"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>

          <ArtTile className="absolute top-1 left-4 flex size-11 -rotate-6 items-center justify-center">
            <BookOpen className="size-5" />
          </ArtTile>

          <ArtTile className="absolute bottom-1 left-4 flex size-11 rotate-6 items-center justify-center">
            <Building2 className="size-5" />
          </ArtTile>

          <ArtTile className="flex size-16 items-center justify-center rounded-2xl border-primary/30 shadow-lg shadow-primary/10">
            <Sparkles className="size-8" strokeWidth={1.5} />
          </ArtTile>

          <ArtTile className="absolute top-1 right-4 flex size-11 rotate-6 items-center justify-center">
            <MessageSquare className="size-5" />
          </ArtTile>

          <ArtTile className="absolute right-4 bottom-1 flex size-11 -rotate-6 items-center justify-center">
            <UserRound className="size-5" />
          </ArtTile>
        </div>
      );
  }
}

export function OnboardingArtwork({
  step,
  complete = false,
  pageTitles = [],
}: {
  step: Step;
  complete?: boolean;
  pageTitles?: string[];
}) {
  return (
    <div aria-hidden="true" className="relative flex h-36 items-center justify-center overflow-hidden sm:h-40">
      <div className="absolute h-28 w-64 rounded-full bg-primary/10 blur-3xl" />

      <svg className="absolute h-32 w-80 text-primary/20" fill="none" viewBox="0 0 320 128">
        <ellipse cx="160" cy="64" rx="140" ry="48" stroke="currentColor" strokeDasharray="3 7" />

        <circle cx="20" cy="64" fill="currentColor" r="3" />

        <circle cx="300" cy="64" fill="currentColor" r="3" />
      </svg>

      <div key={step} className="relative animate-page-result-in motion-reduce:animate-none">
        <StepScene complete={complete} pageTitles={pageTitles} step={step} />
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
