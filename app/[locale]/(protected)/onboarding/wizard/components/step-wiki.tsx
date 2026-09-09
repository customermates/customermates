"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { WikiHomepageSetup } from "@/components/wiki/wiki-homepage-setup";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

export const StepWiki = observer(({ canSetupWithMate }: { canSetupWithMate: boolean }) => {
  const t = useTranslations();
  const { agentChatStore, onboardingWizardStore } = useRootStore();

  if (!canSetupWithMate) {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">{t("WikiSetup.unavailable")}</p>

        <Button className="self-end" type="button" variant="secondary" onClick={onboardingWizardStore.next}>
          {t("WikiSetup.skip")}
        </Button>
      </div>
    );
  }

  return (
    <WikiHomepageSetup
      onAccepted={async (conversationId) => {
        agentChatStore.open();
        onboardingWizardStore.next();
        await agentChatStore.loadConfig();
        await agentChatStore.selectConversation(conversationId);
      }}
      onSkip={onboardingWizardStore.next}
    />
  );
});
