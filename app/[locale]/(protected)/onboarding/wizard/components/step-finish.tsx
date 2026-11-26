"use client";

import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";

export const StepFinish = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore: store } = useRootStore();

  useEffect(() => {
    runUserAction(store.complete);
  }, [store]);

  return (
    <div className="flex min-h-24 flex-col items-center justify-center gap-3" id="onboarding-finish" role="status">
      <Loader2 aria-hidden="true" className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none" />

      <Button disabled={store.isSubmitting} type="button" variant="ghost" onClick={() => runUserAction(store.complete)}>
        {t("OnboardingWizard.finish")}
      </Button>
    </div>
  );
});
