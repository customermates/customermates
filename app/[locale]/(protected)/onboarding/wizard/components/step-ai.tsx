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

  return (
    <div className="flex flex-col gap-4">
      <AiConnectionFlow disabled={onboardingWizardStore.isBusy} showInlineBack={false} store={stepAiStore} />

      <AgentConnectionStatus />
    </div>
  );
});

export const StepAiFooter = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore, stepAiStore } = useRootStore();
  const disabled = stepAiStore.isCreating || onboardingWizardStore.isBusy;
  const isProviderChooser = stepAiStore.route.screen === "providers";

  return (
    <AppCardFooter className={WIZARD_FOOTER_CLASS}>
      <Button
        className="min-h-11"
        disabled={disabled || (isProviderChooser && onboardingWizardStore.isFirstStep)}
        id="onboarding-back"
        type="button"
        variant="ghost"
        onClick={() => runUserAction(isProviderChooser ? onboardingWizardStore.back : stepAiStore.backToProviders)}
      >
        {t("Common.actions.back")}
      </Button>

      <div className={cn(WIZARD_FOOTER_GROUP_CLASS, "justify-end")}>
        {onboardingWizardStore.agentConnected ? null : (
          <Button
            className="min-h-11"
            disabled={disabled}
            id="onboarding-connect-later"
            type="button"
            variant="secondary"
            onClick={() => runUserAction(onboardingWizardStore.continueFromConnect)}
          >
            {t("OnboardingWizard.connect.skip")}
          </Button>
        )}

        <Button
          className="min-h-11 max-sm:disabled:hidden"
          disabled={disabled || !onboardingWizardStore.agentConnected}
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
