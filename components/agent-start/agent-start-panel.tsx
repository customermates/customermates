"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { agentStartUrl } from "@/core/agent-start/agent-start-guide";

import { AgentStartChip } from "./agent-start-chip";

const noSubscription = () => () => undefined;

function useOrigin(): string | null {
  return useSyncExternalStore(
    noSubscription,
    () => window.location?.origin ?? null,
    () => null,
  );
}

export function AgentStartPanel({ className }: { className?: string }) {
  const t = useTranslations();
  const origin = useOrigin();
  if (origin === null) return null;

  return (
    <AgentStartChip
      className={className}
      labels={{
        copied: t("AgentStart.copied"),
        copy: t("AgentStart.copy"),
        failed: t("AgentStart.failed"),
        hint: t("AgentStart.hint"),
      }}
      prompt={t("AgentStart.prompt", { url: agentStartUrl(origin) })}
    />
  );
}
