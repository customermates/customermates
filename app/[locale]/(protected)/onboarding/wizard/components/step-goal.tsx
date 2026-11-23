"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowRight, Cloud, Loader2, MessagesSquare } from "lucide-react";
import { useState, type ReactNode } from "react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { GridPattern } from "@/components/shared/grid-pattern";
import { LogoStack } from "@/components/shared/logo-stack";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/core/utils/cn";

import { MateOrb } from "@/components/mate/mate-orb";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CLOUD_TRIAL } from "@/core/commercial/plan-catalog";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import type { OnboardingJob } from "@/features/onboarding-funnel/onboarding-job";

import { WIZARD_FOOTER_CLASS } from "./wizard-footer";

const AI_PROVIDERS = ["claude", "chatgpt", "cursor", "gemini"] as const;

function GoalHero({ job, selfHosted }: { job: OnboardingJob; selfHosted: boolean }) {
  if (job === "agent") {
    return (
      <LogoStack
        items={AI_PROVIDERS.map((provider) => ({ key: provider, node: <AiClientLogo provider={provider} /> }))}
      />
    );
  }
  if (job === "workspace" && !selfHosted) return <MateOrb className="size-10" />;
  const Icon = job === "workspace" ? Cloud : MessagesSquare;

  return (
    <span className="grid size-10 place-items-center rounded-full border border-border bg-card text-primary shadow-sm">
      <Icon aria-hidden="true" className="size-5" />
    </span>
  );
}

type GoalCardProps = {
  job: OnboardingJob;
  label: string;
  description: string;
  badge?: ReactNode;
  disabled: boolean;
  selfHosted: boolean;
  caption?: ReactNode;
};

function GoalCard({ job, label, description, badge, disabled, selfHosted, caption }: GoalCardProps) {
  const id = `onboarding-goal-${job}`;

  return (
    <div className="relative min-w-0">
      <RadioGroupItem className="peer absolute top-3 right-3 z-10" disabled={disabled} id={id} value={job} />

      <Label
        className={cn(
          "interactive-surface flex h-full min-w-0 cursor-pointer flex-col items-stretch gap-0 overflow-hidden rounded-xl border border-input bg-input-background text-left shadow-xs",
          "peer-data-[state=checked]:border-primary peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-primary",
          "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
        )}
        htmlFor={id}
      >
        <span className="relative grid h-24 place-items-center overflow-hidden border-b border-border bg-muted/40 max-sm:h-20">
          <GridPattern className="opacity-60" density="compact" />

          <span className="relative">
            <GoalHero job={job} selfHosted={selfHosted} />
          </span>
        </span>

        <span className="flex flex-1 flex-col items-start gap-1.5 p-4">
          <span className="pr-6 text-sm leading-snug font-semibold text-foreground">{label}</span>

          <span className="text-xs leading-relaxed font-normal text-muted-foreground">{description}</span>

          {caption}

          {badge ? <span className="mt-auto pt-1">{badge}</span> : null}
        </span>
      </Label>
    </div>
  );
}

const EmptyWorkspaceAction = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore: store } = useRootStore();
  const [confirming, setConfirming] = useState(false);
  const disabled = store.isSubmitting || store.isSaving || store.isInitializing;

  return (
    <>
      <Button
        className="text-muted-foreground"
        disabled={disabled}
        id="onboarding-goal-empty"
        type="button"
        variant="ghost"
        onClick={() => setConfirming(true)}
      >
        {t("WorkspaceSetup.empty.action")}
      </Button>

      <ConfirmDialog
        anchorScope="onboarding-goal-empty-confirm"
        confirmLabel={t("WorkspaceSetup.empty.confirm")}
        confirmVariant="default"
        description={t("WorkspaceSetup.empty.description")}
        open={confirming}
        title={t("WorkspaceSetup.empty.title")}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          await store.startEmptyWorkspace();
          setConfirming(false);
        }}
      />
    </>
  );
});

export const StepGoal = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore: store } = useRootStore();
  const disabled = store.isSubmitting || store.isInitializing;
  const followupVisible = !store.selfHosted && (store.suggestedJob === "followup" || store.selectedJob === "followup");
  const jobs: OnboardingJob[] = ["agent", "workspace", ...(followupVisible ? (["followup"] as const) : [])];
  const mateSuggested = !store.selfHosted && store.suggestedJob === "workspace";
  const mateTitle = store.selfHosted
    ? t("OnboardingWizard.goal.cloud.title")
    : t("OnboardingWizard.goal.workspace.title");
  const mateDescription = store.selfHosted
    ? t("OnboardingWizard.goal.cloud.description", { days: CLOUD_TRIAL.days })
    : t("OnboardingWizard.goal.workspace.description");

  return (
    <div className="flex flex-col gap-3">
      <RadioGroup
        aria-label={t("OnboardingWizard.goal.optionsLabel")}
        className={cn("grid grid-cols-1 gap-3", jobs.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}
        disabled={disabled}
        value={store.selectedJob}
        onValueChange={store.setSelectedJob}
      >
        {jobs.map((job) => {
          if (job === "agent") {
            return (
              <GoalCard
                key={job}
                badge={mateSuggested ? undefined : <Badge>{t("OnboardingWizard.goal.recommended")}</Badge>}
                caption={
                  <span className="sr-only" id="onboarding-goal-works-with">
                    {t("OnboardingWizard.goal.agent.worksWith")}
                  </span>
                }
                description={
                  store.selfHosted
                    ? t("OnboardingWizard.goal.agent.descriptionSelfHosted")
                    : t("OnboardingWizard.goal.agent.description")
                }
                disabled={disabled}
                job={job}
                label={t("OnboardingWizard.goal.agent.title")}
                selfHosted={store.selfHosted}
              />
            );
          }
          if (job === "workspace") {
            return (
              <GoalCard
                key={job}
                badge={
                  store.selfHosted ? (
                    <Badge variant="secondary">
                      <Cloud aria-hidden="true" />

                      {t("OnboardingWizard.goal.cloud.badge")}
                    </Badge>
                  ) : mateSuggested ? (
                    <Badge variant="secondary">{t("OnboardingWizard.goal.suggested")}</Badge>
                  ) : undefined
                }
                description={mateDescription}
                disabled={disabled}
                job={job}
                label={mateTitle}
                selfHosted={store.selfHosted}
              />
            );
          }
          return (
            <GoalCard
              key={job}
              badge={<Badge variant="secondary">{t("OnboardingWizard.goal.suggested")}</Badge>}
              description={t("OnboardingWizard.goal.followup.description")}
              disabled={disabled}
              job={job}
              label={t("OnboardingWizard.goal.followup.title")}
              selfHosted={store.selfHosted}
            />
          );
        })}
      </RadioGroup>

      {store.cloudTrialOpened ? (
        <p className="text-xs text-muted-foreground" role="status">
          {t("OnboardingWizard.goal.cloud.opened")}
        </p>
      ) : null}
    </div>
  );
});

export const StepGoalFooter = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore: store } = useRootStore();
  const disabled = store.isSubmitting || store.isSaving || store.isInitializing;

  return (
    <AppCardFooter className={WIZARD_FOOTER_CLASS}>
      <EmptyWorkspaceAction />

      <Button
        disabled={disabled}
        id="onboarding-goal-continue"
        type="button"
        onClick={() => runUserAction(store.chooseJob)}
      >
        {t("OnboardingWizard.continue")}

        {store.isSubmitting ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <ArrowRight aria-hidden="true" className="size-4" />
        )}
      </Button>
    </AppCardFooter>
  );
});
