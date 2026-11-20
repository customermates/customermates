"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";

import { AiConnectionFlow } from "@/components/ai-connection/ai-connection-flow";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";

import { AgentConnectionStatus } from "./agent-connection-status";
import { WIZARD_FOOTER_CLASS, WIZARD_FOOTER_GROUP_CLASS } from "./wizard-footer";

export const StepAi = observer(() => {
  const { onboardingWizardStore, stepAiStore } = useRootStore();
  const flow = (
    <AiConnectionFlow
      disabled={
        onboardingWizardStore.isSubmitting || onboardingWizardStore.isSaving || onboardingWizardStore.isInitializing
      }
      showInlineBack={false}
      store={stepAiStore}
    />
  );

  if (!onboardingWizardStore.connectsAgent) return flow;

  return (
    <div className="flex flex-col gap-4">
      {flow}

      <AgentConnectionStatus />
    </div>
  );
});

const StepConnectFooter = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore, stepAiStore } = useRootStore();
  const interactionDisabled =
    stepAiStore.isCreating ||
    onboardingWizardStore.isSubmitting ||
    onboardingWizardStore.isSaving ||
    onboardingWizardStore.isInitializing;
  const isProviderChooser = stepAiStore.route.screen === "providers";

  return (
    <AppCardFooter className={WIZARD_FOOTER_CLASS}>
      <Button
        disabled={interactionDisabled}
        type="button"
        variant="ghost"
        onClick={() => runUserAction(isProviderChooser ? onboardingWizardStore.back : stepAiStore.backToProviders)}
      >
        {t("Common.actions.back")}
      </Button>

      <div className={cn(WIZARD_FOOTER_GROUP_CLASS, "justify-end")}>
        <Button
          disabled={interactionDisabled}
          id="onboarding-connect-later"
          type="button"
          variant="secondary"
          onClick={() => runUserAction(onboardingWizardStore.continueFromConnect)}
        >
          {t("OnboardingWizard.connect.skip")}
        </Button>

        <Button
          className="max-sm:disabled:hidden"
          disabled={interactionDisabled || !onboardingWizardStore.agentConnected}
          id="onboarding-connect-continue"
          type="button"
          onClick={() => runUserAction(onboardingWizardStore.continueFromConnect)}
        >
          {t("OnboardingWizard.continue")}

          <ArrowRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </AppCardFooter>
  );
});

export const StepAiFooter = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore, stepAiStore } = useRootStore();
  const interactionDisabled =
    stepAiStore.isCreating ||
    onboardingWizardStore.isSubmitting ||
    onboardingWizardStore.isSaving ||
    onboardingWizardStore.isInitializing;
  const isProviderChooser = stepAiStore.route.screen === "providers";

  if (onboardingWizardStore.connectsAgent) return <StepConnectFooter />;

  return (
    <AppCardFooter className="max-sm:flex-col-reverse max-sm:items-stretch max-sm:gap-2">
      <Button
        disabled={interactionDisabled}
        type="button"
        variant="secondary"
        onClick={() => runUserAction(isProviderChooser ? onboardingWizardStore.back : stepAiStore.backToProviders)}
      >
        {t("Common.actions.back")}
      </Button>

      {isProviderChooser ? (
        <Button
          disabled={interactionDisabled}
          type="button"
          onClick={() => runUserAction(() => onboardingWizardStore.complete())}
        >
          {t("OnboardingWizard.finish")}
        </Button>
      ) : (
        <Button
          disabled={!stepAiStore.canFinish || interactionDisabled}
          type="button"
          onClick={() => runUserAction(() => onboardingWizardStore.complete())}
        >
          {t("OnboardingWizard.finish")}
        </Button>
      )}
    </AppCardFooter>
  );
});
