"use client";

import {
  Blocks,
  BookOpen,
  Check,
  ClipboardCheck,
  Compass,
  LayoutTemplate,
  Mail,
  Plug,
  UserRound,
  UsersRound,
} from "lucide-react";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useRootStore } from "@/core/stores/root-store.provider";
import { VisualArtboard } from "@/components/marketing/visuals/visual-artboard";
import { GridPattern } from "@/components/shared/grid-pattern";
import { cn } from "@/core/utils/cn";

import type { WizardStep } from "./onboarding-wizard.store";
import type { MilestoneStep } from "./onboarding-wizard-flow";

type SceneStep = Extract<WizardStep, "profile">;
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

const ProfileScene = observer(function ProfileScene() {
  const t = useTranslations();
  const { stepProfileStore } = useRootStore();
  const { firstName = "", lastName = "", workspaceName, email = "" } = stepProfileStore?.form ?? {};
  const name = [firstName, lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  const context = (workspaceName ?? "").trim() || email;

  return (
    <div
      className="flex w-72 max-w-[80%] items-center gap-3 product-card rounded-card px-4 py-3"
      id="onboarding-profile-preview"
    >
      <Avatar className="size-10 rounded-full text-sm" name={[firstName, lastName]} size="lg" />

      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("truncate text-sm font-semibold", !name && "text-muted-foreground")}>
            {name || t("OnboardingWizard.profile.previewName")}
          </span>

          <Badge className="shrink-0" variant="secondary">
            {t("OnboardingWizard.profile.previewRole")}
          </Badge>
        </div>

        <span className="truncate text-xs text-muted-foreground">{context}</span>
      </div>
    </div>
  );
});

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
        <ProfileScene />
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
