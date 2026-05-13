"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { FeedbackModal } from "./company/components/feedback/feedback-modal";
import { CompanyUserModal } from "./company/components/user/user-modal";
import { CompanyInviteModal } from "./company/components/company-invite/company-invite-modal";
import { AuditLogModal } from "./company/components/audit-log/audit-log-modal";
import { EntityHistoryDetailsModal } from "./company/components/audit-log/entity-history-details-modal";
import { EntityHistoryModal } from "./company/components/audit-log/entity-history-modal";
import { WebhookDeliveryModal } from "./company/components/webhook/webhook-delivery-modal";
import { WebhookModal } from "./company/components/webhook/webhook-modal";
import { ApiKeyModal } from "./profile/components/api-key-modal";

import { Toaster } from "@/components/ui/sonner";
import { GlobalSearchModal } from "@/app/components/global-search-modal";
import { EntityDrawer } from "@/components/modal/entity-drawer";
import { LoadingOverlay } from "@/components/shared/loading-overlay";
import { NavigationLoadingOverlay } from "@/components/shared/navigation-loading-overlay";
import { DeleteConfirmationModal } from "@/components/modal/delete-confirmation-modal";
import { NavigationGuardModal } from "@/components/modal/navigation-guard-modal";
import { UnexpectedErrorToaster } from "@/components/shared/unexpected-error-toaster";
import { TranslationSync } from "@/components/shared/translation-sync";
import { useRootStore } from "@/core/stores/root-store.provider";
import { CustomColumnModal } from "@/components/data-view/custom-columns/custom-column-modal";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { closeAllModals, globalSearchModalStore } = useRootStore();

  useEffect(() => closeAllModals(), [pathname, closeAllModals]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        globalSearchModalStore.open();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  return (
    <>
      {children}

      <Toaster />

      <DeleteConfirmationModal />

      <NavigationGuardModal />

      <LoadingOverlay />

      <NavigationLoadingOverlay />

      <UnexpectedErrorToaster />

      <TranslationSync />

      <GlobalSearchModal />

      <CompanyUserModal />

      <CompanyInviteModal />

      <EntityDrawer />

      <FeedbackModal />

      <CustomColumnModal />

      <AuditLogModal />

      <EntityHistoryModal />

      <EntityHistoryDetailsModal />

      <ApiKeyModal />

      <WebhookDeliveryModal />

      <WebhookModal />
    </>
  );
}
