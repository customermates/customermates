"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CopyableCode } from "@/components/shared/copyable-code";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/lib/utils";

import { InviteByEmailForm } from "../../../company/components/company-invite/invite-by-email-form";
import { getOrCreateInviteTokenAction } from "../../../company/actions";
import { seedOnboardingDataAction } from "../actions";

export const InviteLink = () => {
  const t = useTranslations("OnboardingWizard.invite");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [loadingLink, setLoadingLink] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await getOrCreateInviteTokenAction();
        setInviteLink(`${window.location.origin}/invitation/${res.token}`);
      } finally {
        setLoadingLink(false);
      }
    })();
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{t("linkDescription")}</p>

      {loadingLink ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />

          {t("loadingLink")}
        </div>
      ) : inviteLink ? (
        <CopyableCode value={inviteLink} />
      ) : (
        <p className="text-xs text-destructive">{t("linkFailed")}</p>
      )}

      <p className="text-xs text-muted-foreground">{t("linkValidity")}</p>
    </div>
  );
};

const DemoDataChoice = observer(() => {
  const t = useTranslations("OnboardingWizard.demoData");
  const { onboardingWizardStore } = useRootStore();
  const { keepDemoData } = onboardingWizardStore;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{t("title")}</h3>

        <p className="text-xs text-muted-foreground">{t("description")}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {[true, false].map((value) => {
          const active = keepDemoData === value;
          const labelKey = value ? "keepLabel" : "cleanLabel";
          const descriptionKey = value ? "keepDescription" : "cleanDescription";
          return (
            <button
              key={String(value)}
              aria-pressed={active}
              className={cn(
                "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
                active ? "border-primary bg-primary/5" : "bg-card hover:border-foreground/30",
              )}
              type="button"
              onClick={() => onboardingWizardStore.setKeepDemoData(value)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">{t(labelKey)}</div>

                {value && <Badge variant="success">{t("recommended")}</Badge>}
              </div>

              <div className="text-xs text-muted-foreground">{t(descriptionKey)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
});

export const StepInvite = observer(() => {
  const t = useTranslations("OnboardingWizard.invite");
  const { onboardingWizardStore } = useRootStore();

  useEffect(() => {
    onboardingWizardStore.setBeforeNext(async () => {
      const result = await seedOnboardingDataAction({
        salesType: onboardingWizardStore.salesType,
        keepDemoData: onboardingWizardStore.keepDemoData,
      });
      if (!result.ok) return false;
      onboardingWizardStore.setMinStepIndex(onboardingWizardStore.currentStepIndex + 1);
      return true;
    });
    return () => onboardingWizardStore.setBeforeNext(null);
  }, [onboardingWizardStore]);

  return (
    <div className="flex flex-col gap-5">
      <DemoDataChoice />

      <Tabs className="w-full" defaultValue="link">
        <TabsList>
          <TabsTrigger value="link">{t("tabs.link")}</TabsTrigger>

          <TabsTrigger value="email">{t("tabs.email")}</TabsTrigger>
        </TabsList>

        <TabsContent className="mt-3" value="link">
          <InviteLink />
        </TabsContent>

        <TabsContent className="mt-3" value="email">
          <InviteByEmailForm />
        </TabsContent>
      </Tabs>
    </div>
  );
});
