"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ToastProvider } from "@heroui/toast";

import { FeedbackModal } from "./company/components/feedback/feedback-modal";
import { CompanyUserModal } from "./company/components/user/user-modal";
import { CompanyInviteModal } from "./company/components/company-invite/company-invite-modal";
import { AuditLogModal } from "./company/components/audit-log/audit-log-modal";
import { WebhookDeliveryModal } from "./company/components/webhook/webhook-delivery-modal";
import { WebhookModal } from "./company/components/webhook/webhook-modal";
import { ApiKeyModal } from "./profile/components/api-key-modal";

import { GlobalSearchModal } from "@/app/components/global-search-modal";
import { ContactModal } from "@/app/[locale]/(protected)/contacts/components/contact-modal";
import { DealModal } from "@/app/[locale]/(protected)/deals/components/deal-modal";
import { OrganizationModal } from "@/app/[locale]/(protected)/organizations/components/organization-modal";
import { ServiceModal } from "@/app/[locale]/(protected)/services/components/service-modal";
import { TaskModal } from "@/app/[locale]/(protected)/tasks/components/task-modal";
import { XLoadingOverlay } from "@/components/x-loading-overlay";
import { XDeleteConfirmationModal } from "@/components/x-modal/x-delete-confirmation-modal";
import { XUnexpectedErrorToaster } from "@/components/x-unexpected-error-toaster";
import { XTranslationSync } from "@/components/x-translation-sync";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XCustomColumnModal } from "@/components/x-data-view/x-custom-column/x-custom-column-modal";
import { XEditFiltersModal } from "@/components/x-data-view/x-filter-modal/x-edit-filters-modal";

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
  }, [globalSearchModalStore]);

  return (
    <>
      {children}

      <ToastProvider />

      <XDeleteConfirmationModal />

      <XLoadingOverlay />

      <XUnexpectedErrorToaster />

      <XTranslationSync />

      <GlobalSearchModal />

      <CompanyUserModal />

      <CompanyInviteModal />

      <ContactModal />

      <OrganizationModal />

      <DealModal />

      <ServiceModal />

      <TaskModal />

      <FeedbackModal />

      <XCustomColumnModal />

      <AuditLogModal />

      <ApiKeyModal />

      <WebhookDeliveryModal />

      <WebhookModal />

      <XEditFiltersModal />
    </>
  );
}
