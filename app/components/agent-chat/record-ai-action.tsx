"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { observer } from "mobx-react-lite";
import type { AgentContextAttachment } from "@/ee/agent-chat/agent-context";
import { agentContextAttachmentKey } from "@/ee/agent-chat/agent-context";
import { useRootStore } from "@/core/stores/root-store.provider";
import { AskAiAction, useAskAiAction } from "@/components/ui/ask-ai-action";
import type { AppModalButtonActionProps } from "@/components/modal/app-modal-action";

type Props = {
  context: AgentContextAttachment;
  active?: boolean;
  registerContext?: boolean;
};

export function useRecordAiAction({
  context,
  active = true,
  registerContext = false,
}: Props): AppModalButtonActionProps | null {
  const askAiAction = useAskAiAction();
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
  return askAiAction({
    onClick: () => agentChatStore.openWithContextDraft({ context, draft: "", pageRoute: pathname }),
  });
}

export const RecordAiAction = observer(function RecordAiAction({
  className,
  ...props
}: Props & { className?: string }) {
  const askAi = useRecordAiAction(props);
  return askAi ? <AskAiAction className={className} placement="topbar" onClick={askAi.onClick} /> : null;
});
