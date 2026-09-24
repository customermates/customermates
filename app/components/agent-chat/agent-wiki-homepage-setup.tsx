"use client";

import type { WikiHomepageSetupState } from "@/features/wiki/get-wiki-homepage-setup-state.interactor";

import { observer } from "mobx-react-lite";

import { WikiHomepageSetup } from "@/components/wiki/wiki-homepage-setup";
import { OVERLAY_SCROLL_REGION } from "@/components/ui/overlay-contract";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";

export const AgentWikiHomepageSetup = observer(function AgentWikiHomepageSetup({
  initialState,
}: {
  initialState: WikiHomepageSetupState;
}) {
  const { agentChatStore: store } = useRootStore();

  return (
    <div className={cn(OVERLAY_SCROLL_REGION, "flex flex-col justify-end px-6 py-8")}>
      <div className="mx-auto w-full max-w-sm">
        <WikiHomepageSetup
          compact
          canStart={!store.usage?.blockedReason}
          initialState={initialState}
          onAccepted={async (conversationId) => {
            await store.selectConversation(conversationId);
            if (store.conversationId === conversationId && !store.conversationLoadError)
              store.dismissWikiHomepageSetup();
          }}
          onSkip={() => store.close()}
          onStarted={store.markWikiHomepageSetupAccepted}
        />
      </div>
    </div>
  );
});
