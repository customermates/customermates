"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { FeedbackModal } from "./settings/(workspace)/components/feedback/feedback-modal";
import { CompanyUserModal } from "./settings/(workspace)/components/user/user-modal";
import { CompanyInviteModal } from "./settings/(workspace)/components/company-invite/company-invite-modal";
import { WebhookDeliveryModal } from "./settings/(workspace)/components/webhook/webhook-delivery-modal";
import { WebhookModal } from "./settings/(workspace)/components/webhook/webhook-modal";
import { RoutineModal } from "./routines/components/routine-modal";
import { ApiKeyModal } from "./settings/(account)/components/api-key-modal";
import { ConnectUpsellModal } from "./settings/(account)/components/connect-upsell-modal";

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
import { GlobalKeyboardShortcuts } from "@/app/components/keyboard-shortcuts/global-keyboard-shortcuts";
import { KeyboardShortcutsDialog } from "@/app/components/keyboard-shortcuts/keyboard-shortcuts-dialog";
import { ViewPicker } from "@/components/data-view/views/view-picker";

const ConnectedAccountModal = dynamic(
  () => import("./settings/(account)/components/connected-account-modal").then((mod) => mod.ConnectedAccountModal),
  { ssr: false },
);
const WorkspaceRecordEditor = dynamic(
  () => import("@/components/records/workspace-record-editor").then((mod) => mod.WorkspaceRecordEditor),
  { ssr: false },
);
const RecordComposeRecovery = dynamic(
  () => import("@/components/records/record-compose-recovery").then((mod) => mod.RecordComposeRecovery),
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

          <GlobalKeyboardShortcuts />

          <KeyboardShortcutsDialog />

          <ViewPicker />

          <GlobalSearchModal />

          <CompanyUserModal />

          <CompanyInviteModal />

          <WorkspaceRecordEditor />

          <RecordComposeRecovery />

          <FeedbackModal />

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
