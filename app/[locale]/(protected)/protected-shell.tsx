"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { stripLocalePrefix } from "@/i18n/locale-registry";

import { FeedbackModal } from "./company/components/feedback/feedback-modal";
import { CompanyUserModal } from "./company/components/user/user-modal";
import { CompanyInviteModal } from "./company/components/company-invite/company-invite-modal";
import { AuditLogModal } from "./company/components/audit-log/audit-log-modal";
import { WebhookDeliveryModal } from "./company/components/webhook/webhook-delivery-modal";
import { WebhookModal } from "./company/components/webhook/webhook-modal";
import { RoutineModal } from "./routines/components/routine-modal";
import { ApiKeyModal } from "./profile/components/api-key-modal";
import { ConnectUpsellModal } from "./profile/components/connect-upsell-modal";

import { Toaster } from "@/components/ui/sonner";
import { GlobalSearchModal } from "@/app/components/global-search-modal";
import { AgentChat } from "@/app/components/agent-chat/agent-chat";
import { LoadingOverlay } from "@/components/shared/loading-overlay";
import { DeleteConfirmationModal } from "@/components/modal/delete-confirmation-modal";
import { NavigationGuardModal } from "@/components/modal/navigation-guard-modal";
import { UnexpectedErrorToaster } from "@/components/shared/unexpected-error-toaster";
import { TranslationSync } from "@/components/shared/translation-sync";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useProtectedEnhancementsAllowed } from "@/app/components/navigation/protected-enhancements-context";

const ConnectedAccountModal = dynamic(
  () => import("./profile/components/connected-account-modal").then((mod) => mod.ConnectedAccountModal),
  { ssr: false },
);
const LegacyRecordDrawerBridge = dynamic(
  () => import("@/components/records/legacy-record-drawer-bridge").then((mod) => mod.LegacyRecordDrawerBridge),
  { ssr: false },
);
const WorkspaceRecordEditor = dynamic(
  () => import("@/components/records/workspace-record-editor").then((mod) => mod.WorkspaceRecordEditor),
  { ssr: false },
);
const TimelineDetailModal = dynamic(
  () => import("@/features/messaging/activities/activities-detail-modal").then((mod) => mod.TimelineDetailModal),
  { ssr: false },
);

export function ProtectedShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const rootStore = useRootStore();
  const { closeAllModals } = rootStore;
  const protectedEnhancementsAllowed = useProtectedEnhancementsAllowed();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (!protectedEnhancementsAllowed || previousPathname.current !== pathname) closeAllModals();
    previousPathname.current = pathname;
  }, [pathname, closeAllModals, protectedEnhancementsAllowed]);

  useEffect(() => {
    if (!protectedEnhancementsAllowed) return;
    const { globalSearchModalStore } = rootStore;

    function handleKeyDown(event: KeyboardEvent) {
      if (!event.metaKey && !event.ctrlKey) return;
      if (!rootStore.recordWorkspaceStore.routeReady(stripLocalePrefix(pathname))) return;

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
  }, [protectedEnhancementsAllowed, rootStore, pathname]);

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

          <LegacyRecordDrawerBridge />

          <WorkspaceRecordEditor />

          <FeedbackModal />

          <AuditLogModal />

          <ApiKeyModal />

          <ConnectedAccountModal />

          <ConnectUpsellModal />

          <TimelineDetailModal />

          <WebhookDeliveryModal />

          <RoutineModal />

          <WebhookModal />

          {rootStore.agentChatEnabled && <AgentChat />}
        </>
      ) : null}
    </>
  );
}
