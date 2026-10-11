"use client";

import type { OnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";
import type { WorkspaceSetupStatusView } from "@/ee/workspace-setup/workspace-setup-status";
import type { WizardStep } from "./onboarding-wizard.store";

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { comparer, reaction } from "mobx";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { Button } from "@/components/ui/button";
import { WizardProgress } from "@/components/shared/wizard-progress";
import { useRootStore } from "@/core/stores/root-store.provider";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";

import { OnboardingArtwork, OnboardingMilestones } from "./onboarding-artwork";
import { wizardSteps } from "./onboarding-wizard.store";

import { StepProfile } from "./step-profile";
import { StepAi, StepAiFooter } from "./step-ai";
import { StepInvite } from "./step-invite";
import { StepSetup, useHydratedSetupStore } from "./setup/step-setup";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

type Props = {
  profileCompleted: boolean;
  userId?: string;
  savedProgress?: OnboardingWizardProgress;
  setupStatus?: WorkspaceSetupStatusView;
  setupStepCompleted?: boolean;
  onboardingIntent?: string;
  inviterName?: string;
  isInvited?: boolean;
  sessionEmail?: string;
  sessionFirstName?: string;
  sessionLastName?: string;
  sessionAvatarUrl?: string;
};

const UNAVAILABLE_SETUP: WorkspaceSetupStatusView = { available: false, reason: "selfHosted", setup: null };

export function resolveWizardResume({
  profileCompleted,
  isInvited,
  setupAvailable,
  setupStepCompleted,
}: {
  profileCompleted: boolean;
  isInvited: boolean;
  setupAvailable: boolean;
  setupStepCompleted: boolean;
}) {
  const steps = wizardSteps(setupAvailable);
  if (!profileCompleted) return { steps, resumeStepIndex: 0 };
  const resumeStep: WizardStep = isInvited || setupStepCompleted || !setupAvailable ? "invite" : "setup";
  return { steps, resumeStepIndex: steps.indexOf(resumeStep) };
}

const OnboardingWizardContent = observer(
  ({
    profileCompleted,
    userId,
    savedProgress,
    setupStatus,
    setupStepCompleted = false,
    onboardingIntent,
    inviterName,
    isInvited = false,
    sessionEmail = "",
    sessionFirstName,
    sessionLastName,
    sessionAvatarUrl,
  }: Props) => {
    const t = useTranslations();
    const { onboardingWizardStore, appMode } = useRootStore();
    const setupAvailable = profileCompleted
      ? Boolean(setupStatus?.available) && !isInvited
      : appMode === "cloud" && !isInvited;
    const setupStore = useHydratedSetupStore(setupStatus ?? UNAVAILABLE_SETUP);
    const { steps, resumeStepIndex } = resolveWizardResume({
      profileCompleted,
      isInvited,
      setupAvailable,
      setupStepCompleted,
    });
    const resumesSavedStep = steps[resumeStepIndex] === "invite" && profileCompleted;
    const initialStepIndex = resumesSavedStep && savedProgress?.step === "ai" ? steps.indexOf("ai") : resumeStepIndex;
    const initializationKey = JSON.stringify([resumeStepIndex, userId, savedProgress, setupAvailable]);
    const [initializedKey, setInitializedKey] = useState<string | null>(null);
    const isStepSynchronized = initializedKey === initializationKey;
    const currentStep: WizardStep = isStepSynchronized ? onboardingWizardStore.currentStep : steps[initialStepIndex];
    const currentStepIndex = isStepSynchronized ? onboardingWizardStore.currentStepIndex : initialStepIndex;
    const isFirstStep = isStepSynchronized ? onboardingWizardStore.isFirstStep : initialStepIndex <= resumeStepIndex;
    const totalSteps = steps.length;
    const { isSubmitting, next, back } = onboardingWizardStore;
    const headingRef = useRef<HTMLHeadingElement>(null);
    const previousStep = useRef(currentStep);
    const setupStage = setupStore.stage;

    useEffect(() => {
      onboardingWizardStore.initialize(resumeStepIndex, userId, savedProgress, setupAvailable);
      setInitializedKey(initializationKey);
      return reaction(
        () => onboardingWizardStore.progress,
        (progress) => {
          void onboardingWizardStore.persistProgress(progress).catch(reportApplicationError);
        },
        { equals: comparer.structural },
      );
    }, [initializationKey, onboardingWizardStore, resumeStepIndex, savedProgress, setupAvailable, userId]);

    useEffect(() => {
      if (previousStep.current !== currentStep) headingRef.current?.focus();
      previousStep.current = currentStep;
    }, [currentStep]);

    if (currentStep === "setup" && setupStage === "build") return <StepSetup />;

    const renderStep = () => {
      switch (currentStep) {
        case "profile":
          return (
            <StepProfile
              avatarUrl={sessionAvatarUrl}
              email={sessionEmail}
              firstName={sessionFirstName}
              inviterName={inviterName}
              isInvited={isInvited}
              lastName={sessionLastName}
              onboardingIntent={onboardingIntent}
            />
          );
        case "ai":
          return isStepSynchronized ? <StepAi /> : <div aria-busy="true" className="min-h-36" />;
        case "setup":
          return <StepSetup />;
        case "invite":
          return <StepInvite />;
      }
    };

    const showFooterNav = currentStep === "invite";
    const planStage = currentStep === "setup" && setupStage === "plan";
    const title = planStage ? t("WorkspaceSetup.plan.title") : t(`OnboardingWizard.steps.${currentStep}.title`);
    const subtitle = planStage
      ? t("WorkspaceSetup.plan.subtitle")
      : currentStep === "profile" && isInvited
        ? t("OnboardingWizard.steps.profile.invitedSubtitle")
        : t(`OnboardingWizard.steps.${currentStep}.subtitle`);

    return (
      <AppCard
        className={cn(
          "relative shadow-xl shadow-primary/5",
          currentStep !== "setup" ? "max-w-2xl" : planStage ? "max-w-5xl" : "max-w-3xl",
        )}
      >
        {currentStep !== "setup" ? <OnboardingArtwork step={currentStep} /> : null}

        <AppCardBody>
          <div className="flex flex-col gap-1">
            {!isInvited && (
              <div className="text-xs text-muted-foreground">
                {t("OnboardingWizard.progress", {
                  current: currentStepIndex + 1,
                  total: totalSteps,
                })}
              </div>
            )}

            <h1 ref={headingRef} className="text-2xl font-semibold" tabIndex={-1}>
              {title}
            </h1>

            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {!isInvited && (
            <>
              <OnboardingMilestones
                current={currentStepIndex}
                labels={{
                  profile: t("OnboardingWizard.milestones.profile"),
                  setup: t("OnboardingWizard.milestones.setup"),
                  invite: t("OnboardingWizard.milestones.invite"),
                  ai: t("OnboardingWizard.milestones.ai"),
                }}
                steps={steps}
              />

              <div className="sr-only">
                <WizardProgress
                  current={currentStepIndex + 1}
                  label={t("OnboardingWizard.progressLabel")}
                  total={totalSteps}
                  valueText={t("OnboardingWizard.progress", { current: currentStepIndex + 1, total: totalSteps })}
                />
              </div>
            </>
          )}

          {renderStep()}
        </AppCardBody>

        {showFooterNav && (
          <AppCardFooter>
            <Button
              disabled={isFirstStep || isSubmitting || onboardingWizardStore.isSaving || !isStepSynchronized}
              id="onboarding-back"
              type="button"
              variant="secondary"
              onClick={() => runUserAction(back)}
            >
              {t("Common.actions.back")}
            </Button>

            <Button
              disabled={isSubmitting || onboardingWizardStore.isSaving || !isStepSynchronized}
              id="onboarding-next"
              type="button"
              onClick={() => runUserAction(next)}
            >
              {t("OnboardingWizard.next")}
            </Button>
          </AppCardFooter>
        )}

        {currentStep === "ai" && isStepSynchronized ? <StepAiFooter /> : null}
      </AppCard>
    );
  },
);

export const OnboardingWizard = serverRenderedClient(OnboardingWizardContent);
