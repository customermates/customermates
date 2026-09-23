"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { useRootStore } from "@/core/stores/root-store.provider";
import type { EntityType } from "@/generated/prisma";

export function useAgentRecordContext({
  enabled,
  entityType,
  recordId,
  name,
  typeLabel,
}: {
  enabled: boolean;
  entityType: EntityType | null;
  recordId: string | null;
  name: string | null;
  typeLabel: string | null;
}) {
  const pathname = usePathname();
  const t = useTranslations();
  const { agentChatStore } = useRootStore();

  useEffect(() => {
    if (!enabled || !agentChatStore || !entityType || !recordId || !name || !typeLabel) return;

    return agentChatStore.contextRegistry.register(pathname, () => [
      {
        context: {
          reference: { kind: "record", entityType, recordId },
          label: t("AgentChat.context.recordLabel", { type: typeLabel, name }),
        },
        pageRoute: pathname,
      },
    ]);
  }, [agentChatStore, enabled, entityType, name, pathname, recordId, t, typeLabel]);
}
