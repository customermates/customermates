"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowRight, Cloud, Loader2, MessagesSquare } from "lucide-react";
import { useState } from "react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { LogoStack } from "@/components/shared/logo-stack";
import { SelectableCard } from "@/components/forms/selectable-card";
import { RadioGroup } from "@/components/ui/radio-group";

import { MateOrb } from "@/components/mate/mate-orb";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CLOUD_TRIAL } from "@/core/commercial/plan-catalog";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { SETUP_QUESTIONS } from "@/features/workspace-setup/setup-interview";
import type { OnboardingJob } from "@/features/onboarding-funnel/onboarding-job";

import { WIZARD_FOOTER_CLASS } from "./wizard-footer";

const AI_PROVIDERS = ["claude", "chatgpt", "gemini", "cursor"] as const;

const OPTION_CLASS = "min-h-16 py-3.5";

const EmptyWorkspaceAction = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore: store } = useRootStore();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button
        className="min-h-11 text-muted-foreground"
        disabled={store.isBusy}
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
          setConfirming(false);
          await store.startEmptyWorkspace();
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
  const jobs: OnboardingJob[] = ["workspace", "agent", ...(followupVisible ? (["followup"] as const) : [])];

  return (
    <div className="flex flex-col gap-3">
      <RadioGroup
        aria-label={t("OnboardingWizard.goal.optionsLabel")}
        className="grid grid-cols-1 gap-3"
        disabled={disabled}
        value={store.selectedJob}
        onValueChange={store.setSelectedJob}
      >
        {jobs.map((job) => {
          if (job === "workspace") {
            return store.selfHosted ? (
              <SelectableCard
                key={job}
                badge={
                  <Badge variant="secondary">
                    <Cloud aria-hidden="true" />

                    {t("OnboardingWizard.goal.cloud.badge")}
                  </Badge>
                }
                description={t("OnboardingWizard.goal.cloud.description", { days: CLOUD_TRIAL.days })}
                disabled={disabled}
                id="onboarding-goal-workspace"
                label={t("OnboardingWizard.goal.cloud.title")}
                labelClassName={OPTION_CLASS}
                leading={<MateOrb className="size-5" />}
                selectionMode="single"
                value={job}
              />
            ) : (
              <SelectableCard
                key={job}
                badge={<Badge>{t("OnboardingWizard.goal.fastest")}</Badge>}
                description={t("OnboardingWizard.goal.workspace.description", { count: SETUP_QUESTIONS.length })}
                disabled={disabled}
                id="onboarding-goal-workspace"
                label={t("OnboardingWizard.goal.workspace.title")}
                labelClassName={OPTION_CLASS}
                leading={<MateOrb className="size-5" />}
                selectionMode="single"
                value={job}
              />
            );
          }
          if (job === "agent") {
            return (
              <SelectableCard
                key={job}
                disabled={disabled}
                id="onboarding-goal-agent"
                label={t("OnboardingWizard.goal.agent.title")}
                labelClassName={OPTION_CLASS}
                selectionMode="single"
                value={job}
                visual={
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs font-normal text-muted-foreground">
                    <LogoStack
                      items={AI_PROVIDERS.map((provider) => ({
                        key: provider,
                        node: <AiClientLogo provider={provider} />,
                      }))}
                      size="sm"
                    />

                    <span id="onboarding-goal-works-with">{t("OnboardingWizard.goal.agent.worksWith")}</span>
                  </span>
                }
              />
            );
          }
          return (
            <SelectableCard
              key={job}
              badge={<Badge variant="secondary">{t("OnboardingWizard.goal.suggested")}</Badge>}
              description={t("OnboardingWizard.goal.followup.description")}
              disabled={disabled}
              id="onboarding-goal-followup"
              label={t("OnboardingWizard.goal.followup.title")}
              labelClassName={OPTION_CLASS}
              leading={<MessagesSquare aria-hidden="true" className="size-5 text-muted-foreground" />}
              selectionMode="single"
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

  return (
    <AppCardFooter className={WIZARD_FOOTER_CLASS}>
      <EmptyWorkspaceAction />

      <Button
        className="min-h-11"
        disabled={store.isBusy}
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
