"use client";

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
import type { OnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";

import { StepProfile } from "./step-profile";
import { StepAi, StepAiFooter } from "./step-ai";
import { StepInvite } from "./step-invite";

type Props = {
  profileCompleted: boolean;
  userId?: string;
  savedProgress?: OnboardingWizardProgress;
  onboardingIntent?: string;
  inviterName?: string;
  isInvited?: boolean;
  sessionEmail?: string;
  sessionFirstName?: string;
  sessionLastName?: string;
  sessionAvatarUrl?: string;
};

export const OnboardingWizard = observer(
  ({
    profileCompleted,
    userId,
    savedProgress,
    onboardingIntent,
    inviterName,
    isInvited = false,
    sessionEmail = "",
    sessionFirstName,
    sessionLastName,
    sessionAvatarUrl,
  }: Props) => {
    const t = useTranslations();
    const { onboardingWizardStore } = useRootStore();
    const initialStepIndex = profileCompleted ? (savedProgress?.step === "ai" ? 2 : 1) : 0;
    const initializationKey = JSON.stringify([profileCompleted, userId, savedProgress]);
    const [initializedKey, setInitializedKey] = useState<string | null>(null);
    const isStepSynchronized = initializedKey === initializationKey;
    const currentStep = isStepSynchronized
      ? onboardingWizardStore.currentStep
      : profileCompleted
        ? (savedProgress?.step ?? "invite")
        : "profile";
    const currentStepIndex = isStepSynchronized ? onboardingWizardStore.currentStepIndex : initialStepIndex;
    const isFirstStep = isStepSynchronized
      ? onboardingWizardStore.isFirstStep
      : initialStepIndex <= (profileCompleted ? 1 : 0);
    const { totalSteps, isSubmitting, next, back } = onboardingWizardStore;
    const headingRef = useRef<HTMLHeadingElement>(null);
    const previousStep = useRef(currentStep);

    useEffect(() => {
      onboardingWizardStore.initialize(profileCompleted, userId, savedProgress);
      setInitializedKey(initializationKey);
      return reaction(
        () => onboardingWizardStore.progress,
        (progress) => {
          void onboardingWizardStore.persistProgress(progress).catch(reportApplicationError);
        },
        { equals: comparer.structural },
      );
    }, [initializationKey, onboardingWizardStore, profileCompleted, savedProgress, userId]);

    useEffect(() => {
      if (previousStep.current !== currentStep) headingRef.current?.focus();
      previousStep.current = currentStep;
    }, [currentStep]);

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
        case "invite":
          return <StepInvite />;
      }
    };

    const showFooterNav = currentStep !== "profile" && currentStep !== "ai";

    return (
      <AppCard className="max-w-2xl">
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
              {t(`OnboardingWizard.steps.${currentStep}.title`)}
            </h1>

            <p className="text-sm text-muted-foreground">
              {currentStep === "profile" && isInvited
                ? t("OnboardingWizard.steps.profile.invitedSubtitle")
                : t(`OnboardingWizard.steps.${currentStep}.subtitle`)}
            </p>
          </div>

          {!isInvited && (
            <WizardProgress
              current={currentStepIndex + 1}
              label={t("OnboardingWizard.progressLabel")}
              total={totalSteps}
              valueText={t("OnboardingWizard.progress", {
                current: currentStepIndex + 1,
                total: totalSteps,
              })}
            />
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
              {t("OnboardingWizard.back")}
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
