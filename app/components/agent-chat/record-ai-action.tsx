"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { observer } from "mobx-react-lite";
import type { AgentContextAttachment } from "@/ee/agent-chat/agent-context";
import { agentContextAttachmentKey } from "@/ee/agent-chat/agent-context";
import { useRootStore } from "@/core/stores/root-store.provider";
import { ViewAiAction } from "@/components/data-view/views/view-ai-action";

export const RecordAiAction = observer(function RecordAiAction({
  context,
  active = true,
  registerContext = false,
  className,
}: {
  context: AgentContextAttachment;
  active?: boolean;
  registerContext?: boolean;
  className?: string;
}) {
  const root = useRootStore();
  const agentChatStore = root.agentChatEnabled ? root.agentChatStore : null;
  const pathname = usePathname();
  const serialized = JSON.stringify(context);
  const key = agentContextAttachmentKey(context);
  useEffect(() => {
    if (!active || !registerContext || !agentChatStore) return;
    const context = JSON.parse(serialized) as AgentContextAttachment;
    return agentChatStore.contextRegistry.register(pathname, () => [{ context, pageRoute: pathname }]);
  }, [active, registerContext, agentChatStore, key, pathname, serialized]);
  if (!active || !agentChatStore || agentChatStore.enabled === false) return null;
  return (
    <ViewAiAction
      className={className}
      onClick={() => agentChatStore.openWithContextDraft({ context, draft: "", pageRoute: pathname })}
    />
  );
});
