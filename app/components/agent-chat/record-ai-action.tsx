"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import type { AgentContextAttachment } from "@/ee/agent-chat/agent-context";
import { agentContextAttachmentKey } from "@/ee/agent-chat/agent-context";
import { useRootStore } from "@/core/stores/root-store.provider";
import { ViewAiAction } from "@/components/data-view/views/view-ai-action";
import { AppModalAction } from "@/components/modal/app-modal-action";

type Props = {
  context: AgentContextAttachment;
  active?: boolean;
  registerContext?: boolean;
};

/** Registers the record context for the assistant and returns the Ask AI handler, or null when unavailable. */
function useRecordAiAction({ context, active = true, registerContext = false }: Props) {
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
  return () => agentChatStore.openWithContextDraft({ context, draft: "", pageRoute: pathname });
}

export const RecordAiAction = observer(function RecordAiAction({
  className,
  ...props
}: Props & { className?: string }) {
  const askAi = useRecordAiAction(props);
  return askAi ? <ViewAiAction className={className} onClick={askAi} /> : null;
});

/** Icon-only Ask AI for an overlay header action rail. */
export const RecordAiIconAction = observer(function RecordAiIconAction(props: Props) {
  const t = useTranslations();
  const askAi = useRecordAiAction(props);
  return askAi ? (
    <AppModalAction icon={Sparkles} id="record-ask-ai" label={t("DataView.views.askAi")} onClick={askAi} />
  ) : null;
});
