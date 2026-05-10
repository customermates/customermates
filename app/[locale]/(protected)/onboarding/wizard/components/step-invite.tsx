"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Loader2 } from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CopyableCode } from "@/components/shared/copyable-code";

import { InviteByEmailForm } from "../../../company/components/company-invite/invite-by-email-form";
import { getOrCreateInviteTokenAction } from "../../../company/actions";

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

export const StepInvite = observer(() => {
  const t = useTranslations("OnboardingWizard.invite");

  return (
    <Tabs className="w-full" defaultValue="link">
      <TabsList variant="line">
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
  );
});
