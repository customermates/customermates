"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Blocks, Bot, Loader2, MessagesSquare } from "lucide-react";

import { SelectableCard } from "@/components/forms/selectable-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/radio-group";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { ONBOARDING_JOBS } from "@/features/onboarding-funnel/onboarding-job";

const JOB_ICONS = { workspace: Blocks, followup: MessagesSquare, agent: Bot } as const;

export const StepGoal = observer(() => {
  const t = useTranslations();
  const copy = {
    workspace: {
      title: t("OnboardingWizard.goal.workspace.title"),
      description: t("OnboardingWizard.goal.workspace.description"),
    },
    followup: {
      title: t("OnboardingWizard.goal.followup.title"),
      description: t("OnboardingWizard.goal.followup.description"),
    },
    agent: { title: t("OnboardingWizard.goal.agent.title"), description: t("OnboardingWizard.goal.agent.description") },
  };
  const { onboardingWizardStore: store } = useRootStore();
  const disabled = store.isSubmitting || store.isSaving || store.isInitializing;

  return (
    <div className="flex flex-col gap-3">
      <RadioGroup
        aria-label={t("OnboardingWizard.goal.optionsLabel")}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        disabled={disabled}
        value={store.selectedJob}
        onValueChange={store.setSelectedJob}
      >
        {ONBOARDING_JOBS.map((job) => {
          const Icon = JOB_ICONS[job];
          return (
            <SelectableCard
              key={job}
              description={copy[job].description}
              disabled={disabled}
              id={`onboarding-goal-${job}`}
              label={copy[job].title}
              leading={<Icon aria-hidden="true" className="size-4 text-primary" />}
              selectionMode="single"
              value={job}
              visual={
                store.suggestedJob === job ? (
                  <Badge className="mt-1" variant="secondary">
                    {t("OnboardingWizard.goal.suggested")}
                  </Badge>
                ) : undefined
              }
            />
          );
        })}
      </RadioGroup>

      <Button
        className="mt-2 self-end"
        disabled={disabled}
        id="onboarding-goal-continue"
        type="button"
        onClick={() => runUserAction(store.chooseJob)}
      >
        {store.isSubmitting && <Loader2 className="size-4 animate-spin" />}

        {t("OnboardingWizard.next")}
      </Button>
    </div>
  );
});
