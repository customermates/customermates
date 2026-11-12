"use client";

import type { OnboardingWizardProgress } from "@/features/onboarding-wizard/onboarding-wizard-progress.schema";
import type { WorkspaceSetupStatusView } from "@/ee/workspace-setup/workspace-setup-status";
import type { WizardJobChoice, WizardStep } from "./onboarding-wizard.store";
import type { OnboardingJobChoiceView } from "@/features/onboarding-funnel/get-onboarding-job-choice.interactor";
import type {
  OnboardingTemplateCard,
  OnboardingTemplatePreselection,
} from "@/features/onboarding-templates/onboarding-template-offer";

import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { comparer, reaction } from "mobx";
import { useTranslations } from "next-intl";
import { CircleCheck } from "lucide-react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { Button } from "@/components/ui/button";
import { WizardProgress } from "@/components/shared/wizard-progress";
import { useRootStore } from "@/core/stores/root-store.provider";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import { isTemplateSlug } from "@/core/templates/template-slugs";

import { OnboardingArtwork, OnboardingMilestones } from "./onboarding-artwork";
import { connectsAgentWithVerification, isMilestoneStep, resolveWizardResume } from "./onboarding-wizard-flow";

import { StepProfile } from "./step-profile";
import { StepGoal, StepGoalFooter } from "./step-goal";
import { StepSource } from "./step-source";
import { StepPlaybook } from "./step-playbook";
import { StepAi, StepAiFooter } from "./step-ai";
import { StepTemplate, StepTemplateFooter } from "./step-template";
import { StepPrompt, StepPromptFooter } from "./step-prompt";
import { StepInvite } from "./step-invite";
import { StepSetup, useHydratedSetupStore } from "./setup/step-setup";
import { resolveSetupStage } from "./setup/setup-interview-state";
import { useSelectedAgentName } from "./use-selected-agent-name";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { PRESELECTED_ONBOARDING_JOB } from "@/features/onboarding-funnel/onboarding-job";

export { resolveWizardResume } from "./onboarding-wizard-flow";

type Props = {
  profileCompleted: boolean;
  userId?: string;
  savedProgress?: OnboardingWizardProgress;
  setupStatus?: WorkspaceSetupStatusView;
  setupStepCompleted?: boolean;
  jobChoice?: OnboardingJobChoiceView;
  templates?: readonly OnboardingTemplateCard[];
  templatePreselection?: OnboardingTemplatePreselection;
  onboardingIntent?: string;
  sourceAvailable?: boolean;
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
const NO_TEMPLATES: readonly OnboardingTemplateCard[] = [];
const NO_PRESELECTION: OnboardingTemplatePreselection = { slug: null, reason: null };

export function wizardJobChoice(
  view: Pick<OnboardingJobChoiceView, "preselectedJob" | "signupJob" | "suggestedPlaybook"> | undefined,
  fallbackJob: WizardJobChoice["selectedJob"] = PRESELECTED_ONBOARDING_JOB,
): WizardJobChoice {
  return {
    selectedJob: view?.preselectedJob ?? fallbackJob,
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
    templates = NO_TEMPLATES,
    templatePreselection = NO_PRESELECTION,
    onboardingIntent,
    sourceAvailable: sourceOffered = false,
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
    const agentName = useSelectedAgentName();
    const selfHosted = appMode === "self-hosted";
    const chooseAvailable = !isInvited && appMode !== "demo";
    const templatesAvailable = chooseAvailable && templates.length > 0;
    const sourceAvailable = chooseAvailable && sourceOffered && appMode === "cloud";
    const setupAvailable = profileCompleted
      ? Boolean(setupStatus?.available) && !isInvited
      : appMode === "cloud" && !isInvited;
    const { store: setupStore, ready: setupReady } = useHydratedSetupStore(setupStatus ?? UNAVAILABLE_SETUP);
    const { steps, resumeStepIndex, flow } = resolveWizardResume({
      profileCompleted,
      isInvited,
      setupAvailable,
      chooseAvailable,
      templatesAvailable,
      sourceAvailable,
      sourceResolved: jobChoice?.discoveryResolved,
      setupStepCompleted,
      jobSelected: !jobChoice || jobChoice.selectedJob !== null,
      job: jobChoice?.preselectedJob ?? (chooseAvailable ? PRESELECTED_ONBOARDING_JOB : undefined),
      setupStarted: Boolean(setupStatus?.setup),
      savedStep: savedProgress?.step,
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
          chooseAvailable ? PRESELECTED_ONBOARDING_JOB : undefined,
        ),
      [chooseAvailable, preselectedJob, signupJob, suggestedPlaybook],
    );
    const savedTemplate = savedProgress?.template ?? null;
    const initialTemplate =
      savedTemplate !== null && isTemplateSlug(savedTemplate) && templates.some((card) => card.slug === savedTemplate)
        ? savedTemplate
        : templatePreselection.slug;
    const emptyChosen = flow === "empty";
    const initialStepIndex = resumeStepIndex;
    const initializationKey = JSON.stringify([
      resumeStepIndex,
      userId,
      savedProgress,
      setupAvailable,
      initialJobChoice,
      chooseAvailable,
      templatesAvailable,
      sourceAvailable,
      emptyChosen,
      selfHosted,
      initialTemplate,
    ]);
    const [initializedKey, setInitializedKey] = useState<string | null>(null);
    const isStepSynchronized = initializedKey === initializationKey;
    const currentStep: WizardStep = isStepSynchronized ? onboardingWizardStore.currentStep : steps[initialStepIndex];
    const visibleSteps = isStepSynchronized ? onboardingWizardStore.steps : steps;
    const connectsAgent = isStepSynchronized
      ? onboardingWizardStore.connectsAgent
      : connectsAgentWithVerification({ setupAvailable, chooseAvailable, templatesAvailable }, flow);
    const milestoneSteps = visibleSteps.filter(isMilestoneStep).filter((step) => step !== "prompt");
    const milestoneIndex = milestoneSteps.indexOf(
      currentStep === "prompt" ? "template" : currentStep === "source" ? "goal" : currentStep,
    );
    const jobOpen =
      visibleSteps.includes("goal") &&
      (currentStep === "profile" || currentStep === "source" || currentStep === "goal");
    const progressText = jobOpen
      ? t("OnboardingWizard.progressOpen", { current: milestoneIndex + 1 })
      : t("OnboardingWizard.progress", { current: milestoneIndex + 1, total: milestoneSteps.length });
    const { isSubmitting, next, back } = onboardingWizardStore;
    const isFirstStep = isStepSynchronized ? onboardingWizardStore.isFirstStep : initialStepIndex <= resumeStepIndex;
    const headingRef = useRef<HTMLHeadingElement>(null);
    const previousStep = useRef(currentStep);
    const setupStage = setupReady ? setupStore.stage : resolveSetupStage(setupStatus ?? UNAVAILABLE_SETUP);
    const selectedTemplateName = templates.find((card) => card.slug === onboardingWizardStore.selectedTemplate)?.name;

    useEffect(() => {
      onboardingWizardStore.initialize(resumeStepIndex, userId, savedProgress, setupAvailable, initialJobChoice, {
        chooseAvailable,
        templatesAvailable,
        sourceAvailable,
        emptyChosen,
        selfHosted,
        template: initialTemplate,
      });
      setInitializedKey(initializationKey);
      return reaction(
        () => onboardingWizardStore.progress,
        (progress) => {
          void onboardingWizardStore.persistProgress(progress).catch(reportApplicationError);
        },
        { equals: comparer.structural },
      );
    }, [
      chooseAvailable,
      emptyChosen,
      initialJobChoice,
      initialTemplate,
      initializationKey,
      onboardingWizardStore,
      resumeStepIndex,
      savedProgress,
      selfHosted,
      setupAvailable,
      sourceAvailable,
      templatesAvailable,
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
        case "source":
          return isStepSynchronized ? <StepSource /> : <div aria-busy="true" className="min-h-36" />;
        case "goal":
          return isStepSynchronized ? <StepGoal /> : <div aria-busy="true" className="min-h-36" />;
        case "playbook":
          return isStepSynchronized ? <StepPlaybook /> : <div aria-busy="true" className="min-h-36" />;
        case "ai":
          return isStepSynchronized ? <StepAi /> : <div aria-busy="true" className="min-h-36" />;
        case "template":
          return isStepSynchronized ? (
            <StepTemplate cards={templates} preselection={templatePreselection} />
          ) : (
            <div aria-busy="true" className="min-h-36" />
          );
        case "prompt":
          return isStepSynchronized ? <StepPrompt /> : <div aria-busy="true" className="min-h-36" />;
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
        : currentStep === "goal" && selfHosted
          ? t("OnboardingWizard.steps.goal.titleSelfHosted")
          : currentStep === "ai" && connectsAgent
            ? t("OnboardingWizard.steps.connect.title")
            : currentStep === "prompt"
              ? agentName
                ? t("OnboardingWizard.steps.prompt.title", { agent: agentName })
                : t("OnboardingWizard.steps.prompt.titleGeneric")
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
              : currentStep === "goal" && selfHosted
                ? t("OnboardingWizard.steps.goal.subtitleSelfHosted")
                : currentStep === "ai" && connectsAgent
                  ? t("OnboardingWizard.steps.connect.subtitle")
                  : currentStep === "template" && !connectsAgent
                    ? t("OnboardingWizard.steps.template.subtitleMate")
                    : currentStep === "prompt"
                      ? t("OnboardingWizard.steps.prompt.subtitle", { template: selectedTemplateName ?? "" })
                      : t(`OnboardingWizard.steps.${currentStep}.subtitle`);
    const showArtwork =
      currentStep === "profile" || currentStep === "invite" || (currentStep === "ai" && !connectsAgent);
    const agentBadge =
      currentStep === "template" && connectsAgent && onboardingWizardStore.agentConnected
        ? agentName
          ? t("OnboardingWizard.template.connected", { agent: agentName })
          : t("OnboardingWizard.template.connectedGeneric")
        : null;

    return (
      <AppCard
        className={cn(
          "relative shadow-xl shadow-primary/5",
          currentStep === "goal" || currentStep === "playbook"
            ? "max-w-3xl"
            : currentStep === "template"
              ? "max-w-4xl"
              : currentStep !== "setup"
                ? "max-w-2xl"
                : planStage
                  ? "max-w-5xl"
                  : "max-w-3xl",
        )}
      >
        <AppCardBody>
          {showArtwork ? <OnboardingArtwork step={currentStep} /> : null}

          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div className="flex min-w-0 flex-col gap-1">
              <h1 ref={headingRef} className="text-2xl font-semibold" tabIndex={-1}>
                {title}
              </h1>

              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>

            {agentBadge ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success" role="status">
                <CircleCheck aria-hidden="true" className="size-4" />

                {agentBadge}
              </span>
            ) : null}
          </div>

          {!isInvited && (
            <>
              <OnboardingMilestones
                current={milestoneIndex}
                labels={{
                  profile: t("OnboardingWizard.milestones.profile"),
                  goal: t("OnboardingWizard.milestones.goal"),
                  playbook: t("OnboardingWizard.milestones.playbook"),
                  setup: t("OnboardingWizard.milestones.setup"),
                  invite: t("OnboardingWizard.milestones.invite"),
                  ai: connectsAgent ? t("OnboardingWizard.milestones.connect") : t("OnboardingWizard.milestones.ai"),
                  template: t("OnboardingWizard.milestones.template"),
                  prompt: t("OnboardingWizard.milestones.template"),
                }}
                steps={milestoneSteps}
              />

              <div className="sr-only">
                <WizardProgress
                  current={milestoneIndex + 1}
                  label={t("OnboardingWizard.progressLabel")}
                  total={milestoneSteps.length}
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

        {currentStep === "goal" && isStepSynchronized ? <StepGoalFooter /> : null}

        {currentStep === "ai" && isStepSynchronized ? <StepAiFooter /> : null}

        {currentStep === "template" && isStepSynchronized ? <StepTemplateFooter cards={templates} /> : null}

        {currentStep === "prompt" && isStepSynchronized ? <StepPromptFooter /> : null}
      </AppCard>
    );
  },
);

export const OnboardingWizard = serverRenderedClient(OnboardingWizardContent);
