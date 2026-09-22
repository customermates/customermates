"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { observer } from "mobx-react-lite";

import { FeedbackModal } from "./company/components/feedback/feedback-modal";
import { CompanyUserModal } from "./company/components/user/user-modal";
import { CompanyInviteModal } from "./company/components/company-invite/company-invite-modal";
import { AuditLogModal } from "./company/components/audit-log/audit-log-modal";
import { WebhookDeliveryModal } from "./company/components/webhook/webhook-delivery-modal";
import { ImportWizard } from "@/components/data-transfer/import-wizard";
import { WebhookModal } from "./company/components/webhook/webhook-modal";
import { RoutineModal } from "./routines/components/routine-modal";
import { ApiKeyModal } from "./profile/components/api-key-modal";
import { ConnectedAccountModal } from "./profile/components/connected-account-modal";
import { ConnectUpsellModal } from "./profile/components/connect-upsell-modal";

import { Toaster } from "@/components/ui/sonner";
import { GlobalSearchModal } from "@/app/components/global-search-modal";
import { AgentChat } from "@/app/components/agent-chat/agent-chat";
import { EntityDrawer } from "@/components/entity-detail/entity-drawer";
import { LoadingOverlay } from "@/components/shared/loading-overlay";
import { DeleteConfirmationModal } from "@/components/modal/delete-confirmation-modal";
import { NavigationGuardModal } from "@/components/modal/navigation-guard-modal";
import { UnexpectedErrorToaster } from "@/components/shared/unexpected-error-toaster";
import { TranslationSync } from "@/components/shared/translation-sync";
import { useRootStore } from "@/core/stores/root-store.provider";
import { CustomColumnModal } from "@/components/data-view/custom-columns/custom-column-modal";
import { TimelineDetailModal } from "@/features/messaging/activities/activities-detail-modal";
import { useProtectedEnhancementsAllowed } from "@/app/components/navigation/protected-enhancements-context";

const ProtectedLayout = observer(function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const rootStore = useRootStore();
  const { closeAllModals } = rootStore;
  const protectedEnhancementsAllowed = useProtectedEnhancementsAllowed();
  const onboardingAssistantOpen =
    pathname.endsWith("/onboarding/wizard") && rootStore.agentChatEnabled && rootStore.agentChatStore.isOpen;
  const wasOnboardingAssistantOpen = useRef(onboardingAssistantOpen);

  useEffect(() => closeAllModals(), [pathname, closeAllModals, protectedEnhancementsAllowed]);

  useEffect(() => {
    const wasOpen = wasOnboardingAssistantOpen.current;
    wasOnboardingAssistantOpen.current = onboardingAssistantOpen;
    if (!wasOpen || onboardingAssistantOpen || !pathname.endsWith("/onboarding/wizard")) return;
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-agent-focus-return]")?.focus());
  }, [onboardingAssistantOpen, pathname]);

  useEffect(() => {
    if (!protectedEnhancementsAllowed) return;
    const { globalSearchModalStore } = rootStore;

    function handleKeyDown(event: KeyboardEvent) {
      if (!event.metaKey && !event.ctrlKey) return;

      if (event.key === "k") {
        event.preventDefault();
        globalSearchModalStore.open();
      }

      if (event.key === "j" && rootStore.agentChatEnabled) {
        const agentChat = rootStore.agentChatStore;
        if (agentChat.enabled !== true) return;

        event.preventDefault();
        agentChat.toggle();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [protectedEnhancementsAllowed, rootStore]);

  return (
    <>
      {children}

      <Toaster />

      <LoadingOverlay />

      <UnexpectedErrorToaster />

      <TranslationSync />

      {protectedEnhancementsAllowed ? (
        <>
          <DeleteConfirmationModal />

          <NavigationGuardModal />

          <GlobalSearchModal />

          <CompanyUserModal />

          <CompanyInviteModal />

          <EntityDrawer />

          <FeedbackModal />

          <CustomColumnModal />

          <AuditLogModal />

          <ApiKeyModal />

          <ConnectedAccountModal />

          <ConnectUpsellModal />

          <TimelineDetailModal />

          <WebhookDeliveryModal />

          <RoutineModal />

          <ImportWizard />

          <WebhookModal />

          {rootStore.agentChatEnabled && <AgentChat />}
        </>
      ) : null}

      {!protectedEnhancementsAllowed && onboardingAssistantOpen ? <AgentChat /> : null}
    </>
  );
});

export default ProtectedLayout;
