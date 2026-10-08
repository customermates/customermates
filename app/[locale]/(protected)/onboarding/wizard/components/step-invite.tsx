"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Loader2 } from "lucide-react";

import { SegmentedControl, SegmentedControlPanel } from "@/components/ui/segmented-control";
import { CopyableCode } from "@/components/shared/copyable-code";
import { useRootStore } from "@/core/stores/root-store.provider";
import { reportApplicationError } from "@/core/errors/report-application-error";

import { InviteByEmailForm } from "@/app/[locale]/(protected)/settings/(workspace)/components/company-invite/invite-by-email-form";

const InviteLink = observer(() => {
  const t = useTranslations();
  const { inviteByEmailStore } = useRootStore();
  const { inviteToken, isLoadingToken } = inviteByEmailStore;
  const inviteLink =
    inviteToken && typeof window !== "undefined" ? `${window.location.origin}/invitation/${inviteToken}` : null;

  useEffect(() => {
    void inviteByEmailStore.loadInviteToken().catch(reportApplicationError);
  }, [inviteByEmailStore]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{t("OnboardingWizard.invite.linkDescription")}</p>

      {isLoadingToken ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />

          {t("OnboardingWizard.invite.loadingLink")}
        </div>
      ) : inviteLink ? (
        <CopyableCode value={inviteLink} />
      ) : (
        <p className="text-xs text-destructive">{t("OnboardingWizard.invite.linkFailed")}</p>
      )}
    </div>
  );
});

export const StepInvite = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore } = useRootStore();

  return (
    <SegmentedControl
      className="w-full"
      items={[
        { value: "link", label: t("OnboardingWizard.invite.tabs.link"), disabled: onboardingWizardStore.isSaving },
        { value: "email", label: t("OnboardingWizard.invite.tabs.email"), disabled: onboardingWizardStore.isSaving },
      ]}
      label={t("CompanyInviteModal.title")}
      value={onboardingWizardStore.inviteTab}
      onValueChange={onboardingWizardStore.setInviteTab}
    >
      <SegmentedControlPanel value="link">
        <InviteLink />
      </SegmentedControlPanel>

      <SegmentedControlPanel value="email">
        <InviteByEmailForm />
      </SegmentedControlPanel>
    </SegmentedControl>
  );
});
