"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AiConnectionFlow } from "@/components/ai-connection/ai-connection-flow";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

export const StepAi = observer(() => {
  const { onboardingWizardStore, stepAiStore } = useRootStore();

  return <AiConnectionFlow disabled={onboardingWizardStore.isSubmitting} showInlineBack={false} store={stepAiStore} />;
});

export const StepAiFooter = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore, stepAiStore } = useRootStore();
  const interactionDisabled = stepAiStore.isCreating || onboardingWizardStore.isSubmitting;
  const isProviderChooser = stepAiStore.route.screen === "providers";

  return (
    <AppCardFooter>
      <Button
        disabled={interactionDisabled}
        type="button"
        variant="secondary"
        onClick={isProviderChooser ? onboardingWizardStore.back : stepAiStore.backToProviders}
      >
        {t("OnboardingWizard.back")}
      </Button>

      {isProviderChooser ? (
        <Button disabled={interactionDisabled} type="button" onClick={stepAiStore.selectSkip}>
          {t("OnboardingWizard.ai.choices.skip")}
        </Button>
      ) : (
        <Button
          disabled={!stepAiStore.canFinish || onboardingWizardStore.isSubmitting}
          type="button"
          onClick={() => void onboardingWizardStore.complete()}
        >
          {t("OnboardingWizard.finish")}
        </Button>
      )}
    </AppCardFooter>
  );
});
