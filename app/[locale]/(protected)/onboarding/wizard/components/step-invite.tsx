"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Loader2 } from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CopyableCode } from "@/components/shared/copyable-code";
import { useRootStore } from "@/core/stores/root-store.provider";

import { InviteByEmailForm } from "../../../company/components/company-invite/invite-by-email-form";

const InviteLink = observer(() => {
  const t = useTranslations();
  const { inviteByEmailStore } = useRootStore();
  const { inviteToken, isLoadingToken } = inviteByEmailStore;
  const inviteLink =
    inviteToken && typeof window !== "undefined" ? `${window.location.origin}/invitation/${inviteToken}` : null;

  useEffect(() => {
    void inviteByEmailStore.loadInviteToken();
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

  return (
    <Tabs className="w-full" defaultValue="link">
      <TabsList variant="line">
        <TabsTrigger value="link">{t("OnboardingWizard.invite.tabs.link")}</TabsTrigger>

        <TabsTrigger value="email">{t("OnboardingWizard.invite.tabs.email")}</TabsTrigger>
      </TabsList>

      <TabsContent className="mt-3" value="link">
        <InviteLink />
      </TabsContent>

      <TabsContent className="mt-3" value="email">
        <InviteByEmailForm />
      </TabsContent>
    </Tabs>
  );
});
