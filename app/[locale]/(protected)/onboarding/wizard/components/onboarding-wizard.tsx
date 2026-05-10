"use client";

import type { Company } from "@/generated/prisma";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

import { WIZARD_STEPS } from "./onboarding-wizard.store";
import { StepProfile } from "./step-profile";
import { StepEntities } from "./step-entities";
import { StepCompany } from "./step-company";
import { StepDemoData } from "./step-demo-data";
import { StepAi } from "./step-ai";
import { StepInvite } from "./step-invite";

type Props = {
  profileCompleted: boolean;
  initialCompany: Company | null;
  isInvited?: boolean;
  sessionEmail?: string;
  sessionFirstName?: string;
  sessionLastName?: string;
  sessionAvatarUrl?: string;
};

export const OnboardingWizard = observer(
  ({
    profileCompleted,
    initialCompany,
    isInvited = false,
    sessionEmail = "",
    sessionFirstName,
    sessionLastName,
    sessionAvatarUrl,
  }: Props) => {
    const t = useTranslations("OnboardingWizard");
    const { onboardingWizardStore } = useRootStore();
    const { currentStep, currentStepIndex, totalSteps, isFirstStep, isSubmitting, next, back } = onboardingWizardStore;

    useEffect(() => {
      const aiStepIndex = WIZARD_STEPS.indexOf("ai");
      if (initialCompany?.salesType) {
        onboardingWizardStore.setInitialStep(aiStepIndex);
        return;
      }
      onboardingWizardStore.setInitialStep(profileCompleted ? 1 : 0);
    }, [profileCompleted, initialCompany?.salesType]);

    const renderStep = () => {
      switch (currentStep) {
        case "profile":
          return (
            <StepProfile
              avatarUrl={sessionAvatarUrl}
              email={sessionEmail}
              firstName={sessionFirstName}
              lastName={sessionLastName}
            />
          );
        case "entities":
          return <StepEntities />;
        case "company":
          return initialCompany ? <StepCompany initialCompany={initialCompany} /> : null;
        case "demoData":
          return <StepDemoData />;
        case "ai":
          return <StepAi />;
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
                {t("progress", { current: currentStepIndex + 1, total: totalSteps })}
              </div>
            )}

            <h1 className="text-2xl font-semibold">{t(`steps.${currentStep}.title`)}</h1>

            <p className="text-sm text-muted-foreground">{t(`steps.${currentStep}.subtitle`)}</p>
          </div>

          {!isInvited && (
            <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${((currentStepIndex + 1) / totalSteps) * 100}%` }}
              />
            </div>
          )}

          {renderStep()}
        </AppCardBody>

        {showFooterNav && (
          <AppCardFooter>
            <Button disabled={isFirstStep || isSubmitting} type="button" variant="outline" onClick={back}>
              {t("back")}
            </Button>

            <Button disabled={isSubmitting} type="button" onClick={() => void next()}>
              {t("next")}
            </Button>
          </AppCardFooter>
        )}
      </AppCard>
    );
  },
);
