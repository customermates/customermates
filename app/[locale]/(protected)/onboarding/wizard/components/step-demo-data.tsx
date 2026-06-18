"use client";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useRootStore } from "@/core/stores/root-store.provider";

export const StepDemoData = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore } = useRootStore();
  const { keepDemoData } = onboardingWizardStore;

  useEffect(() => {
    onboardingWizardStore.setBeforeNext(onboardingWizardStore.seedDemoData);
    return () => onboardingWizardStore.setBeforeNext(null);
  }, [onboardingWizardStore]);

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <label className="flex flex-col gap-1 cursor-pointer" htmlFor="keepDemoData">
        <span className="flex items-center gap-2 text-sm font-medium">
          {t("OnboardingWizard.demoData.keepLabel")}

          <Badge variant="success">{t("OnboardingWizard.demoData.recommended")}</Badge>
        </span>

        <span className="text-xs text-muted-foreground">{t("OnboardingWizard.demoData.keepDescription")}</span>
      </label>

      <Switch checked={keepDemoData} id="keepDemoData" onCheckedChange={onboardingWizardStore.setKeepDemoData} />
    </div>
  );
});
