"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useRootStore } from "@/core/stores/root-store.provider";
import type { EntityType } from "@/generated/prisma";

export function useAgentRecordContext({
  enabled,
  entityType,
  recordId,
  name,
}: {
  enabled: boolean;
  entityType: EntityType | null;
  recordId: string | null;
  name: string | null;
}) {
  const pathname = usePathname();
  const { agentChatStore } = useRootStore();

  useEffect(() => {
    if (!enabled || !agentChatStore || !entityType || !recordId || !name) return;

    return agentChatStore.contextRegistry.register(pathname, () => [
      {
        context: {
          reference: { kind: "record", entityType, recordId },
          label: name,
        },
        pageRoute: pathname,
      },
    ]);
  }, [agentChatStore, enabled, entityType, name, pathname, recordId]);
}
