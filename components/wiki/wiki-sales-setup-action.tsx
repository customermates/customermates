"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Action, Resource } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { focusAgentComposer } from "@/app/components/agent-chat/chat-ui";
import { useRouter } from "@/i18n/navigation";

const subscribeToHydration = () => () => undefined;
const clientHydrationSnapshot = () => true;
const serverHydrationSnapshot = () => false;

function useWikiSalesSetup(disabled = false) {
  const { agentChatStore: store, agentChatEnabled, userStore } = useRootStore();
  const t = useTranslations();
  const hydrated = useSyncExternalStore(subscribeToHydration, clientHydrationSnapshot, serverHydrationSnapshot);
  if (
    !hydrated ||
    !store ||
    (store.enabled ?? agentChatEnabled) !== true ||
    store.usage?.blockedReason ||
    !userStore?.can(Resource.wiki, Action.create) ||
    !userStore.can(Resource.wiki, Action.update)
  )
    return { hydrated, available: false, disabled: true, open: () => undefined };

  const unavailable = Boolean(
    disabled ||
      store.isWorking ||
      store.historyMutationPending ||
      store.queuedPrompt ||
      store.composerDraft.trim() ||
      store.composerContexts.length,
  );
  const open = () => {
    store.newConversation();
    store.openWithDraft(t("Wiki.salesSetup.prompt"));
    focusAgentComposer();
  };
  return { hydrated, available: true, disabled: unavailable, open };
}

export const WikiSalesSetupStarter = observer(function WikiSalesSetupStarter() {
  const setup = useWikiSalesSetup();
  const router = useRouter();
  const handled = useRef(false);
  useEffect(() => {
    if (!setup.hydrated || handled.current) return;
    handled.current = true;
    if (setup.available && !setup.disabled) setup.open();
    router.replace("/wiki", { scroll: false });
  }, [router, setup]);
  return null;
});

export const WikiSalesSetupAction = observer(function WikiSalesSetupAction({
  disabled = false,
  surface = "button",
}: {
  disabled?: boolean;
  surface?: "button" | "menu";
}) {
  const setup = useWikiSalesSetup(disabled);
  const t = useTranslations();
  if (!setup.available) return null;
  const content = (
    <>
      <Sparkles aria-hidden="true" />

      {t("Wiki.salesSetup.label")}
    </>
  );

  return surface === "menu" ? (
    <DropdownMenuItem disabled={setup.disabled} onSelect={setup.open}>
      {content}
    </DropdownMenuItem>
  ) : (
    <Button data-agent-focus-return="" disabled={setup.disabled} type="button" variant="secondary" onClick={setup.open}>
      {content}
    </Button>
  );
});
