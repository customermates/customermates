"use client";

import type { OnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";
import type { WorkspaceSetupStatusView } from "@/ee/workspace-setup/workspace-setup-status";
import type { WizardJobChoice, WizardStep } from "./onboarding-wizard.store";
import type { WizardFlowContext } from "./onboarding-wizard-flow";
import type { OnboardingJobChoiceView } from "@/features/onboarding-funnel/get-onboarding-job-choice.interactor";

import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { comparer, reaction } from "mobx";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { Button } from "@/components/ui/button";
import { WizardProgress } from "@/components/shared/wizard-progress";
import { useRootStore } from "@/core/stores/root-store.provider";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";

import { resolveWizardResume, wizardJob } from "./onboarding-wizard-flow";
import { WIZARD_FOOTER_CLASS } from "./wizard-footer";

import { StepProfile } from "./step-profile";
import { StepPlaybook } from "./step-playbook";
import { StepInvite } from "./step-invite";
import { StepChannel, StepChannelFooter } from "./step-channel";
import { StepFinish } from "./step-finish";
import { StepSetup, StepSetupFooter, useHydratedSetupStore } from "./setup/step-setup";
import { useSetupHeading } from "./setup/use-setup-heading";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

export { resolveWizardResume } from "./onboarding-wizard-flow";

type Props = {
  profileCompleted: boolean;
  userId?: string;
  savedProgress?: OnboardingWizardProgress;
  setupStatus?: WorkspaceSetupStatusView;
  setupStepCompleted?: boolean;
  jobChoice?: OnboardingJobChoiceView;
  onboardingIntent?: string;
  flow: WizardFlowContext;
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

export function wizardJobChoice(
  view: Pick<OnboardingJobChoiceView, "selectedJob" | "signupJob" | "suggestedPlaybook"> | undefined,
): WizardJobChoice {
  return {
    job: view ? wizardJob(view) : "workspace",
    jobRecorded: !view || view.selectedJob !== null,
    suggestedPlaybook: view?.suggestedPlaybook ?? null,
  };
}

type Heading = { title: string; subtitle: string | null; question?: { current: number; total: number } | null };

function useStepHeading(step: WizardStep, context: { isInvited: boolean; workspace: string }): Heading {
  const t = useTranslations();
  const setup = useSetupHeading();
  switch (step) {
    case "profile":
      return {
        title: t("OnboardingWizard.steps.profile.title"),
        subtitle: context.isInvited
          ? context.workspace
            ? t("OnboardingWizard.steps.profile.invitedSubtitleNamed", { workspace: context.workspace })
            : t("OnboardingWizard.steps.profile.invitedSubtitle")
          : null,
      };
    case "playbook":
      return {
        title: t("OnboardingWizard.steps.playbook.title"),
        subtitle: t("OnboardingWizard.steps.playbook.subtitle"),
      };
    case "setup":
      return setup;
    case "invite":
      return { title: t("OnboardingWizard.steps.invite.title"), subtitle: t("OnboardingWizard.steps.invite.subtitle") };
    case "channel":
      return {
        title: t("OnboardingWizard.steps.channel.title"),
        subtitle: t("OnboardingWizard.steps.channel.subtitle"),
      };
    case "finish":
      return { title: t("OnboardingWizard.steps.finish.title"), subtitle: null };
  }
}

const InviteFooter = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore: store } = useRootStore();

  return (
    <AppCardFooter className={WIZARD_FOOTER_CLASS}>
      {store.isFirstStep ? (
        <span />
      ) : (
        <Button
          className="min-h-11"
          disabled={store.isBusy}
          id="onboarding-back"
          type="button"
          variant="ghost"
          onClick={() => runUserAction(store.back)}
        >
          {t("Common.actions.back")}
        </Button>
      )}

      <Button
        className="min-h-11"
        disabled={store.isBusy}
        id="onboarding-next"
        type="button"
        onClick={() => runUserAction(store.next)}
      >
        {store.isLastStep ? t("OnboardingWizard.finish") : t("OnboardingWizard.continue")}

        <ArrowRight aria-hidden="true" className="size-4" />
      </Button>
    </AppCardFooter>
  );
});

const OnboardingWizardContent = observer(
  ({
    profileCompleted,
    userId,
    savedProgress,
    setupStatus,
    setupStepCompleted = false,
    jobChoice,
    onboardingIntent,
    flow: flowContext,
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
    const { onboardingWizardStore } = useRootStore();
    const { ready: setupReady } = useHydratedSetupStore(setupStatus ?? UNAVAILABLE_SETUP);
    const selectedJob = jobChoice?.selectedJob;
    const signupJob = jobChoice?.signupJob;
    const suggestedPlaybook = jobChoice?.suggestedPlaybook;
    const initialJobChoice = useMemo(
      () =>
        wizardJobChoice(
          selectedJob === undefined
            ? undefined
            : { selectedJob, signupJob: signupJob ?? null, suggestedPlaybook: suggestedPlaybook ?? null },
        ),
      [selectedJob, signupJob, suggestedPlaybook],
    );
    const { steps, resumeStepIndex, flow } = resolveWizardResume({
      ...flowContext,
      profileCompleted,
      isInvited,
      setupStepCompleted,
      job: initialJobChoice.job,
      savedStep: savedProgress?.step,
    });
    const emptyChosen = flow === "empty";
    const initializationKey = JSON.stringify([
      resumeStepIndex,
      userId,
      savedProgress,
      flowContext,
      initialJobChoice,
      emptyChosen,
    ]);
    const [initializedKey, setInitializedKey] = useState<string | null>(null);
    const isStepSynchronized = initializedKey === initializationKey;
    const currentStep: WizardStep = isStepSynchronized ? onboardingWizardStore.currentStep : steps[resumeStepIndex];
    const visibleSteps = isStepSynchronized ? onboardingWizardStore.steps : steps;
    const stepIndex = Math.max(visibleSteps.indexOf(currentStep), 0);
    const heading = useStepHeading(currentStep, { isInvited, workspace });
    const headingRef = useRef<HTMLHeadingElement>(null);
    const previousHeading = useRef(heading.title);
    const question = heading.question ?? null;
    const progressTotal = Math.max(visibleSteps.filter((step) => step !== "finish").length, 1);
    const progressValue = question
      ? stepIndex + question.current / (question.total + 1)
      : Math.min(stepIndex + 1, progressTotal);
    const progressText = question
      ? t("OnboardingWizard.questionProgress", { current: question.current, total: question.total })
      : t("OnboardingWizard.progress", { current: Math.min(stepIndex + 1, progressTotal), total: progressTotal });

    useEffect(() => {
      const { setupAvailable, ...flags } = flowContext;
      onboardingWizardStore.initialize(resumeStepIndex, userId, savedProgress, setupAvailable, initialJobChoice, {
        ...flags,
        emptyChosen,
      });
      setInitializedKey(initializationKey);
      if (resumeStepIndex > 0) void onboardingWizardStore.recordJob().catch(reportApplicationError);
      return reaction(
        () => onboardingWizardStore.progress,
        (progress) => {
          void onboardingWizardStore.persistProgress(progress).catch(reportApplicationError);
        },
        { equals: comparer.structural },
      );
    }, [
      emptyChosen,
      flowContext,
      initialJobChoice,
      initializationKey,
      onboardingWizardStore,
      resumeStepIndex,
      savedProgress,
      userId,
    ]);

    useEffect(() => {
      if (previousHeading.current !== heading.title) headingRef.current?.focus();
      previousHeading.current = heading.title;
    }, [heading.title]);

    const pending = <div aria-busy="true" className="min-h-36" />;
    const profile = (
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
    const renderStep = () => {
      if (currentStep === "profile") return profile;
      if (currentStep === "invite") return <StepInvite />;
      if (!isStepSynchronized) return pending;
      switch (currentStep) {
        case "playbook":
          return <StepPlaybook />;
        case "setup":
          return setupReady ? <StepSetup /> : pending;
        case "channel":
          return <StepChannel email={sessionEmail} />;
        case "finish":
          return <StepFinish />;
      }
    };

    const renderFooter = () => {
      if (!isStepSynchronized) return null;
      switch (currentStep) {
        case "setup":
          return setupReady ? <StepSetupFooter /> : null;
        case "invite":
          return <InviteFooter />;
        case "channel":
          return <StepChannelFooter />;
        case "profile":
        case "playbook":
        case "finish":
          return null;
      }
    };

    return (
      <AppCard className="relative max-w-xl shadow-xl shadow-primary/5" data-onboarding-step={currentStep}>
        <AppCardBody>
          {isInvited || currentStep === "finish" ? null : (
            <div className="flex flex-col gap-2">
              <WizardProgress
                current={progressValue}
                label={t("OnboardingWizard.progressLabel")}
                total={progressTotal}
                valueText={progressText}
              />

              <p aria-hidden="true" className="text-xs text-muted-foreground" id="onboarding-progress-text">
                {progressText}
              </p>
            </div>
          )}

          <div className="flex min-w-0 flex-col gap-1">
            <h1 ref={headingRef} className="text-xl font-semibold text-balance sm:text-2xl" tabIndex={-1}>
              {heading.title}
            </h1>

            {heading.subtitle ? <p className="text-sm text-pretty text-muted-foreground">{heading.subtitle}</p> : null}
          </div>

          {renderStep()}
        </AppCardBody>

        {renderFooter()}
      </AppCard>
    );
  },
);

export const OnboardingWizard = serverRenderedClient(OnboardingWizardContent);
