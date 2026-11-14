"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowRight, Bot, Cloud, Loader2, MessagesSquare, Sparkles } from "lucide-react";
import { useState } from "react";

import { AppCardFooter } from "@/components/card/app-card-footer";
import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/radio-group";
import { CLOUD_TRIAL } from "@/core/commercial/plan-catalog";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import type { OnboardingJob } from "@/features/onboarding-funnel/onboarding-job";

import { agentChecklist } from "./onboarding-copy";
import { SetupChoiceCard } from "./setup-choice-card";
import { WIZARD_FOOTER_CLASS } from "./wizard-footer";

const AgentProviders = () => {
  const t = useTranslations();

  return (
    <p className="text-xs text-muted-foreground" id="onboarding-goal-works-with">
      {t("OnboardingWizard.goal.agent.worksWith")}
    </p>
  );
};

const AgentSteps = () => {
  const t = useTranslations();

  return (
    <ol
      aria-label={t("OnboardingWizard.goal.agent.stepsLabel")}
      className="grid w-full grid-cols-1 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3"
    >
      {agentChecklist(t).map((label, index) => (
        <li key={label} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium text-foreground"
          >
            {index + 1}
          </span>

          {label}
        </li>
      ))}
    </ol>
  );
};

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
        className="flex flex-col gap-3"
        disabled={disabled}
        value={store.selectedJob}
        onValueChange={store.setSelectedJob}
      >
        {jobs.map((job) => {
          if (job === "agent") {
            return (
              <SetupChoiceCard
                key={job}
                badge={<Badge>{t("OnboardingWizard.goal.recommended")}</Badge>}
                description={
                  store.selfHosted
                    ? t("OnboardingWizard.goal.agent.descriptionSelfHosted")
                    : t("OnboardingWizard.goal.agent.description")
                }
                disabled={disabled}
                id="onboarding-goal-agent"
                leading={<Bot aria-hidden="true" className="size-4 text-primary" />}
                selected={store.selectedJob === job}
                title={t("OnboardingWizard.goal.agent.title")}
                value={job}
              >
                <AgentProviders />

                <AgentSteps />
              </SetupChoiceCard>
            );
          }
          if (job === "workspace") {
            return (
              <SetupChoiceCard
                key={job}
                badge={
                  store.selfHosted ? (
                    <Badge variant="secondary">
                      <Cloud aria-hidden="true" />

                      {t("OnboardingWizard.goal.cloud.badge")}
                    </Badge>
                  ) : undefined
                }
                description={mateDescription}
                disabled={disabled}
                id="onboarding-goal-workspace"
                leading={<Sparkles aria-hidden="true" className="size-4 text-primary" />}
                selected={store.selectedJob === job}
                title={mateTitle}
                value={job}
              />
            );
          }
          return (
            <SetupChoiceCard
              key={job}
              badge={<Badge variant="secondary">{t("OnboardingWizard.goal.suggested")}</Badge>}
              description={t("OnboardingWizard.goal.followup.description")}
              disabled={disabled}
              id="onboarding-goal-followup"
              leading={<MessagesSquare aria-hidden="true" className="size-4 text-primary" />}
              selected={store.selectedJob === job}
              title={t("OnboardingWizard.goal.followup.title")}
              value={job}
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
