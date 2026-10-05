"use client";

import type { WikiHomepageSetupState } from "@/features/wiki/get-wiki-homepage-setup-state.interactor";

import { observer } from "mobx-react-lite";
import { useRef } from "react";
import { useTranslations } from "next-intl";

import { WikiHomepageSetup } from "@/components/wiki/wiki-homepage-setup";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { runUserAction } from "@/core/errors/report-application-error";

import { completeOnboardingWikiStepAction } from "../actions";

type Props = {
  canSetupWithMate: boolean;
  initialState: WikiHomepageSetupState;
};

export const StepWiki = observer(({ canSetupWithMate, initialState }: Props) => {
  const t = useTranslations();
  const { onboardingWizardStore } = useRootStore();
  const completing = useRef(false);
  const completeStep = async () => {
    if (completing.current) return;
    completing.current = true;
    onboardingWizardStore.setIsSubmitting(true);
    try {
      const result = await completeOnboardingWikiStepAction();
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
      if (onboardingWizardStore.currentStep === "wiki") await onboardingWizardStore.next();
    } finally {
      completing.current = false;
      onboardingWizardStore.setIsSubmitting(false);
    }
  };

  if (!canSetupWithMate && initialState.status === "idle") {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">{t("WikiSetup.unavailable")}</p>

        <Button
          className="self-end"
          disabled={onboardingWizardStore.isSubmitting}
          type="button"
          variant="secondary"
          onClick={() => runUserAction(completeStep)}
        >
          {t("OnboardingWizard.wiki.skip")}
        </Button>
      </div>
    );
  }

  return (
    <WikiHomepageSetup
      canStart={canSetupWithMate}
      disabled={onboardingWizardStore.isSubmitting}
      initialState={initialState}
      onContinue={completeStep}
      onSkip={completeStep}
    />
  );
});
