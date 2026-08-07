"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AiConnectionFlow } from "@/components/ai-connection/ai-connection-flow";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

export const StepAi = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore, stepAiStore } = useRootStore();
  const interactionDisabled = stepAiStore.isCreating || onboardingWizardStore.isSubmitting;

  return (
    <div className="flex flex-col gap-4">
      <AiConnectionFlow disabled={onboardingWizardStore.isSubmitting} store={stepAiStore} />

      <div className="flex flex-col-reverse gap-2 xs:flex-row xs:justify-end">
        {stepAiStore.route.screen === "providers" ? (
          <Button
            className="w-full xs:w-fit"
            disabled={interactionDisabled}
            type="button"
            variant="ghost"
            onClick={stepAiStore.selectSkip}
          >
            {t("OnboardingWizard.ai.choices.skip")}
          </Button>
        ) : null}

        <Button
          className="w-full xs:w-fit"
          disabled={!stepAiStore.canFinish || onboardingWizardStore.isSubmitting}
          type="button"
          onClick={() => void onboardingWizardStore.complete()}
        >
          {t("OnboardingWizard.finish")}
        </Button>
      </div>
    </div>
  );
});
