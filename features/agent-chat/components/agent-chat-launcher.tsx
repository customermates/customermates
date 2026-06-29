"use client";

import { observer } from "mobx-react-lite";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

export const AgentChatLauncher = observer(() => {
  const t = useTranslations();
  const { agentChatStore } = useRootStore();

  if (agentChatStore.isOpen) return null;

  return (
    <Button
      aria-label={t("AgentChat.launcher")}
      className="fixed right-6 bottom-6 z-40 rounded-full shadow-lg"
      size="icon-lg"
      title={t("AgentChat.launcher")}
      onClick={agentChatStore.open}
    >
      <Sparkles className="size-5" />
    </Button>
  );
});
