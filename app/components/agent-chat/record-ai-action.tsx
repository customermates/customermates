"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { observer } from "mobx-react-lite";
import type { AgentContextAttachment } from "@/ee/agent-chat/agent-context";
import { agentContextAttachmentKey } from "@/ee/agent-chat/agent-context";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { ViewAiAction } from "@/components/data-view/views/view-ai-action";
import { AppModalAction } from "@/components/modal/app-modal-action";

export const RecordAiAction = observer(function RecordAiAction({
  context,
  active = true,
  registerContext = false,
  iconOnly = false,
  className,
}: {
  context: AgentContextAttachment;
  active?: boolean;
  registerContext?: boolean;
  /** Renders the overlay header icon action used next to an overlay's Close button. */
  iconOnly?: boolean;
  className?: string;
}) {
  const t = useTranslations();
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
  if (iconOnly) {
    return (
      <AppModalAction
        anchorId="record-ask-ai"
        icon={Sparkles}
        id="record-ask-ai"
        label={t("DataView.views.askAi")}
        onClick={() => agentChatStore.openWithContextDraft({ context, draft: "", pageRoute: pathname })}
      />
    );
  }
  return (
    <ViewAiAction
      className={className}
      onClick={() => agentChatStore.openWithContextDraft({ context, draft: "", pageRoute: pathname })}
    />
  );
});
