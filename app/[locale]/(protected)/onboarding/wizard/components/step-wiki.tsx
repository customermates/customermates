"use client";

import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { AgentConversationLog } from "@/app/components/agent-chat/agent-conversation";
import { AgentRouteReloadBridge } from "@/app/components/agent-chat/agent-route-reload";
import { AgentChatStoreProvider } from "@/app/components/agent-chat/agent-chat-store-context";
import { AgentProgressStatus, AgentStatusAnnouncer } from "@/app/components/agent-chat/agent-status-announcer";
import { WikiHomepageSetup } from "@/components/wiki/wiki-homepage-setup";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useRootStore } from "@/core/stores/root-store.provider";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { runUserAction } from "@/core/errors/report-application-error";
import type { WikiHomepageSetupState } from "@/features/wiki/get-wiki-homepage-setup-state.interactor";
import { useRouter } from "@/i18n/navigation";

import { completeOnboardingWikiStepAction } from "../actions";

const WikiSetupConversation = observer(function WikiSetupConversation({ conversationId }: { conversationId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const { wikiSetupChatStore } = useRootStore();
  const requestedConversationId = useRef<string | null>(null);
  const [isRefreshPending, startRefreshTransition] = useTransition();
  const selected = wikiSetupChatStore.conversationId === conversationId;
  const failed =
    wikiSetupChatStore.conversationLoadError && (selected || requestedConversationId.current === conversationId);
  const loading = !failed && (wikiSetupChatStore.conversationLoadPendingId === conversationId || !selected);
  const loadConversation = useCallback(() => {
    requestedConversationId.current = conversationId;
    return wikiSetupChatStore.selectConversationForEmbeddedViewer(conversationId);
  }, [conversationId, wikiSetupChatStore]);
  const refreshPage = useCallback(() => {
    startRefreshTransition(() => router.refresh());
  }, [router]);

  useEffect(() => {
    if (selected || wikiSetupChatStore.conversationLoadPendingId === conversationId) return;
    if (requestedConversationId.current === conversationId) return;
    runUserAction(loadConversation);
  }, [conversationId, loadConversation, selected, wikiSetupChatStore.conversationLoadPendingId]);

  useEffect(() => {
    if (!isRefreshPending && wikiSetupChatStore.routeSyncStatus === "refreshing")
      wikiSetupChatStore.markRouteSyncComplete();
  }, [isRefreshPending, wikiSetupChatStore, wikiSetupChatStore.routeSyncStatus]);

  return (
    <AgentChatStoreProvider store={wikiSetupChatStore}>
      <AgentRouteReloadBridge reload={refreshPage} />

      <TooltipProvider>
        <div
          className="flex h-64 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background sm:h-72"
          data-testid="wiki-setup-conversation"
        >
          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />

              <span>{t("WikiSetup.progressLoading")}</span>
            </div>
          ) : failed ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
              <p className="max-w-sm text-sm text-muted-foreground">{t("WikiSetup.progressLoadFailed")}</p>

              <Button size="sm" type="button" variant="secondary" onClick={() => runUserAction(loadConversation)}>
                {t("ErrorCard.retry")}
              </Button>
            </div>
          ) : (
            <>
              <AgentConversationLog readOnly renderLinksAsText activityContext="wikiHomepageSetup" />

              {wikiSetupChatStore.isWorking ? <AgentProgressStatus /> : null}

              <AgentStatusAnnouncer />
            </>
          )}
        </div>
      </TooltipProvider>
    </AgentChatStoreProvider>
  );
});

export const StepWiki = observer(
  ({ canSetupWithMate, initialState }: { canSetupWithMate: boolean; initialState: WikiHomepageSetupState }) => {
    const t = useTranslations();
    const { onboardingWizardStore } = useRootStore();
    const completing = useRef(false);
    const completeStep = async () => {
      if (completing.current) return;
      completing.current = true;
      onboardingWizardStore.setIsSubmitting(true);
      try {
        const result = await completeOnboardingWikiStepAction();
        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }
        if (onboardingWizardStore.currentStep === "wiki") onboardingWizardStore.next();
      } finally {
        completing.current = false;
        onboardingWizardStore.setIsSubmitting(false);
      }
    };

    if (!canSetupWithMate && initialState.status === "idle") {
      return (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">{t("WikiSetup.unavailable")}</p>

          <Button
            className="self-end"
            disabled={onboardingWizardStore.isSubmitting}
            type="button"
            variant="secondary"
            onClick={() => runUserAction(completeStep)}
          >
            {t("WikiSetup.skip")}
          </Button>
        </div>
      );
    }

    return (
      <WikiHomepageSetup
        onboarding
        canStart={canSetupWithMate}
        disabled={onboardingWizardStore.isSubmitting}
        initialState={initialState}
        renderConversation={(conversationId) => <WikiSetupConversation conversationId={conversationId} />}
        onAccepted={() => undefined}
        onContinue={completeStep}
        onSkip={completeStep}
      />
    );
  },
);
