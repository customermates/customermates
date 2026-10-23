"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { useRootStore } from "@/core/stores/root-store.provider";
import { registerWorkspaceChangedHandler } from "@/core/errors/report-application-error";

export const WorkspaceUnavailableDialog = observer(() => {
  const t = useTranslations();
  const { workspacesStore } = useRootStore();

  useEffect(() => registerWorkspaceChangedHandler(() => workspacesStore.showUnavailable()), [workspacesStore]);

  useEffect(() => {
    function reloadRestoredPage(event: PageTransitionEvent) {
      if (event.persisted && workspacesStore.isNavigating) window.location.reload();
    }

    window.addEventListener("pageshow", reloadRestoredPage);
    return () => window.removeEventListener("pageshow", reloadRestoredPage);
  }, [workspacesStore]);

  return (
    <ConfirmDialog
      anchorScope="workspace-unavailable"
      confirmLabel={t("Workspaces.unavailable.open")}
      confirmVariant="default"
      description={t("Workspaces.unavailable.description")}
      open={workspacesStore.unavailable}
      title={t("Workspaces.unavailable.title")}
      onConfirm={() => workspacesStore.leaveUnavailable()}
    />
  );
});
