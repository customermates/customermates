"use client";

import { observer } from "mobx-react-lite";
import { useRef } from "react";
import { useTranslations } from "next-intl";

import { WikiHomepageSetup } from "@/components/wiki/wiki-homepage-setup";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { runUserAction } from "@/core/errors/report-application-error";
import type { WikiHomepageSetupState } from "@/features/wiki/get-wiki-homepage-setup-state.interactor";

import { completeOnboardingWikiStepAction } from "../actions";

export const StepWiki = observer(
  ({ canSetupWithMate, initialState }: { canSetupWithMate: boolean; initialState: WikiHomepageSetupState }) => {
    const t = useTranslations();
    const { agentChatStore, onboardingWizardStore } = useRootStore();
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
        if (onboardingWizardStore.currentStep === "wiki") onboardingWizardStore.next();
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
            {t("WikiSetup.skip")}
          </Button>
        </div>
      );
    }

    return (
      <WikiHomepageSetup
        onboarding
        canStart={canSetupWithMate}
        disabled={onboardingWizardStore.isSubmitting}
        initialState={initialState}
        onAccepted={async (conversationId) => {
          agentChatStore.open();
          await agentChatStore.loadConfig();
          await agentChatStore.selectConversation(conversationId);
        }}
        onContinue={completeStep}
        onSkip={completeStep}
      />
    );
  },
);
