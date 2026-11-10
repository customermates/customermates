"use client";

import type { OnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";
import type { WorkspaceSetupStatusView } from "@/ee/workspace-setup/workspace-setup-status";
import type { WizardJobChoice, WizardStep } from "./onboarding-wizard.store";
import type { OnboardingJobChoiceView } from "@/features/onboarding-funnel/get-onboarding-job-choice.interactor";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { StepGoal } from "./step-goal";
import { StepPlaybook } from "./step-playbook";
import { StepAi, StepAiFooter } from "./step-ai";
import { StepInvite } from "./step-invite";
import { StepSetup, useHydratedSetupStore } from "./setup/step-setup";
import { resolveSetupStage } from "./setup/setup-interview-state";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { DEFAULT_ONBOARDING_JOB, type OnboardingJob } from "@/features/onboarding-funnel/onboarding-job";

type Props = {
  profileCompleted: boolean;
  userId?: string;
  savedProgress?: OnboardingWizardProgress;
  setupStatus?: WorkspaceSetupStatusView;
  setupStepCompleted?: boolean;
  jobChoice?: OnboardingJobChoiceView;
  onboardingIntent?: string;
  inviterName?: string;
  isInvited?: boolean;
  canNameWorkspace?: boolean;
  sessionEmail?: string;
  sessionFirstName?: string;
  sessionLastName?: string;
  sessionAvatarUrl?: string;
  workspaceName?: string | null;
};

const UNAVAILABLE_SETUP: WorkspaceSetupStatusView = { available: false, reason: "selfHosted", setup: null };

export function resolveWizardResume({
  profileCompleted,
  isInvited,
  setupAvailable,
  setupStepCompleted,
  jobSelected = true,
  job = DEFAULT_ONBOARDING_JOB,
}: {
  profileCompleted: boolean;
  isInvited: boolean;
  setupAvailable: boolean;
  setupStepCompleted: boolean;
  jobSelected?: boolean;
  job?: OnboardingJob;
}) {
  const ownSteps = setupAvailable && !isInvited && !setupStepCompleted && (job === "followup" || job === "agent");
  const steps = wizardSteps(setupAvailable, ownSteps ? job : DEFAULT_ONBOARDING_JOB);
  if (!profileCompleted) return { steps, resumeStepIndex: 0 };
  const chosenStep: WizardStep = !ownSteps ? "setup" : job === "followup" ? "playbook" : "ai";
  const resumeStep: WizardStep =
    isInvited || setupStepCompleted || !setupAvailable ? "invite" : jobSelected ? chosenStep : "goal";
  return { steps, resumeStepIndex: steps.indexOf(resumeStep) };
}

export function wizardJobChoice(
  view: Pick<OnboardingJobChoiceView, "preselectedJob" | "signupJob" | "suggestedPlaybook"> | undefined,
): WizardJobChoice {
  return {
    selectedJob: view?.preselectedJob ?? DEFAULT_ONBOARDING_JOB,
    suggestedJob: view?.signupJob ?? null,
    suggestedPlaybook: view?.suggestedPlaybook ?? null,
  };
}

const OnboardingWizardContent = observer(
  ({
    profileCompleted,
    userId,
    savedProgress,
    setupStatus,
    setupStepCompleted = false,
    jobChoice,
    onboardingIntent,
    inviterName,
    isInvited = false,
    canNameWorkspace = false,
    sessionEmail = "",
    sessionFirstName,
    sessionLastName,
    sessionAvatarUrl,
    workspaceName,
  }: Props) => {
    const t = useTranslations();
    const workspace = workspaceName?.trim() ?? "";
    const { onboardingWizardStore, appMode } = useRootStore();
    const setupAvailable = profileCompleted
      ? Boolean(setupStatus?.available) && !isInvited
      : appMode === "cloud" && !isInvited;
    const { store: setupStore, ready: setupReady } = useHydratedSetupStore(setupStatus ?? UNAVAILABLE_SETUP);
    const { steps, resumeStepIndex } = resolveWizardResume({
      profileCompleted,
      isInvited,
      setupAvailable,
      setupStepCompleted,
      jobSelected: !jobChoice || jobChoice.selectedJob !== null,
      job: jobChoice?.preselectedJob,
    });
    const preselectedJob = jobChoice?.preselectedJob;
    const signupJob = jobChoice?.signupJob;
    const suggestedPlaybook = jobChoice?.suggestedPlaybook;
    const initialJobChoice = useMemo(
      () =>
        wizardJobChoice(
          preselectedJob === undefined
            ? undefined
            : { preselectedJob, signupJob: signupJob ?? null, suggestedPlaybook: suggestedPlaybook ?? null },
        ),
      [preselectedJob, signupJob, suggestedPlaybook],
    );
    const resumesSavedStep = steps[resumeStepIndex] === "invite" && profileCompleted;
    const initialStepIndex = resumesSavedStep && savedProgress?.step === "ai" ? steps.indexOf("ai") : resumeStepIndex;
    const initializationKey = JSON.stringify([
      resumeStepIndex,
      userId,
      savedProgress,
      setupAvailable,
      initialJobChoice,
    ]);
    const [initializedKey, setInitializedKey] = useState<string | null>(null);
    const isStepSynchronized = initializedKey === initializationKey;
    const currentStep: WizardStep = isStepSynchronized ? onboardingWizardStore.currentStep : steps[initialStepIndex];
    const currentStepIndex = isStepSynchronized ? onboardingWizardStore.currentStepIndex : initialStepIndex;
    const isFirstStep = isStepSynchronized ? onboardingWizardStore.isFirstStep : initialStepIndex <= resumeStepIndex;
    const visibleSteps = isStepSynchronized ? onboardingWizardStore.steps : steps;
    const totalSteps = visibleSteps.length;
    const jobOpen = visibleSteps.includes("goal") && (currentStep === "profile" || currentStep === "goal");
    const progressText = jobOpen
      ? t("OnboardingWizard.progressOpen", { current: currentStepIndex + 1 })
      : t("OnboardingWizard.progress", { current: currentStepIndex + 1, total: totalSteps });
    const { isSubmitting, next, back } = onboardingWizardStore;
    const headingRef = useRef<HTMLHeadingElement>(null);
    const previousStep = useRef(currentStep);
    const setupStage = setupReady ? setupStore.stage : resolveSetupStage(setupStatus ?? UNAVAILABLE_SETUP);

    useEffect(() => {
      onboardingWizardStore.initialize(resumeStepIndex, userId, savedProgress, setupAvailable, initialJobChoice);
      setInitializedKey(initializationKey);
      return reaction(
        () => onboardingWizardStore.progress,
        (progress) => {
          void onboardingWizardStore.persistProgress(progress).catch(reportApplicationError);
        },
        { equals: comparer.structural },
      );
    }, [
      initialJobChoice,
      initializationKey,
      onboardingWizardStore,
      resumeStepIndex,
      savedProgress,
      setupAvailable,
      userId,
    ]);

    useEffect(() => {
      if (previousStep.current !== currentStep) headingRef.current?.focus();
      previousStep.current = currentStep;
    }, [currentStep]);

    if (currentStep === "setup" && setupStage === "build")
      return setupReady ? <StepSetup /> : <div aria-busy="true" className="min-h-36 w-full" />;

    const renderStep = () => {
      switch (currentStep) {
        case "profile":
          return (
            <StepProfile
              avatarUrl={sessionAvatarUrl}
              canNameWorkspace={canNameWorkspace}
              email={sessionEmail}
              firstName={sessionFirstName}
              inviterName={inviterName}
              isInvited={isInvited}
              lastName={sessionLastName}
              onboardingIntent={onboardingIntent}
            />
          );
        case "goal":
          return isStepSynchronized ? <StepGoal /> : <div aria-busy="true" className="min-h-36" />;
        case "playbook":
          return isStepSynchronized ? <StepPlaybook /> : <div aria-busy="true" className="min-h-36" />;
        case "ai":
          return isStepSynchronized ? <StepAi /> : <div aria-busy="true" className="min-h-36" />;
        case "setup":
          return setupReady ? <StepSetup /> : <div aria-busy="true" className="min-h-36" />;
        case "invite":
          return <StepInvite />;
      }
    };

    const showFooterNav = currentStep === "invite";
    const planStage = currentStep === "setup" && setupStage === "plan";
    const startStage = currentStep === "setup" && setupStage === "start";
    const title = planStage
      ? t("WorkspaceSetup.plan.title")
      : startStage
        ? t("OnboardingWizard.steps.setup.startTitle")
        : t(`OnboardingWizard.steps.${currentStep}.title`);
    const planPending = currentStep === "setup" && (setupStage === "planning" || setupStage === "planFailed");
    const subtitle = planStage
      ? t("WorkspaceSetup.plan.subtitle")
      : planPending
        ? t("OnboardingWizard.steps.setup.planningSubtitle")
        : startStage
          ? t("OnboardingWizard.steps.setup.startSubtitle")
          : currentStep === "profile" && isInvited
            ? workspace
              ? t("OnboardingWizard.steps.profile.invitedSubtitleNamed", { workspace })
              : t("OnboardingWizard.steps.profile.invitedSubtitle")
            : currentStep === "setup" && setupReady && !setupStore.setup?.websiteUrl
              ? t("OnboardingWizard.steps.setup.withoutWebsiteSubtitle")
              : t(`OnboardingWizard.steps.${currentStep}.subtitle`);

    return (
      <AppCard
        className={cn(
          "relative shadow-xl shadow-primary/5",
          currentStep === "goal" || currentStep === "playbook"
            ? "max-w-3xl"
            : currentStep !== "setup"
              ? "max-w-2xl"
              : planStage
                ? "max-w-5xl"
                : "max-w-3xl",
        )}
      >
        <AppCardBody>
          {currentStep !== "setup" && currentStep !== "goal" && currentStep !== "playbook" ? (
            <OnboardingArtwork step={currentStep} />
          ) : null}

          <div className="flex flex-col gap-1">
            {!isInvited && <div className="text-xs text-muted-foreground">{progressText}</div>}

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
                  goal: t("OnboardingWizard.milestones.goal"),
                  playbook: t("OnboardingWizard.milestones.playbook"),
                  setup: t("OnboardingWizard.milestones.setup"),
                  invite: t("OnboardingWizard.milestones.invite"),
                  ai: t("OnboardingWizard.milestones.ai"),
                }}
                steps={visibleSteps}
              />

              <div className="sr-only">
                <WizardProgress
                  current={currentStepIndex + 1}
                  label={t("OnboardingWizard.progressLabel")}
                  total={totalSteps}
                  valueText={progressText}
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
