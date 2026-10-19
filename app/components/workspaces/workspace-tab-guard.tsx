"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { useRootStore } from "@/core/stores/root-store.provider";
import { registerWorkspaceChangedHandler } from "@/core/errors/report-application-error";

import { workspaceDisplayName } from "./workspace-identity";

export const WorkspaceTabGuard = observer(() => {
  const t = useTranslations();
  const { workspacesStore } = useRootStore();
  const currentCompanyId = workspacesStore.current?.companyId ?? null;
  const notice = workspacesStore.foreignNotice;

  useEffect(() => workspacesStore.connectTabs(), [workspacesStore]);

  useEffect(() => registerWorkspaceChangedHandler(() => workspacesStore.showWorkspaceChanged()), [workspacesStore]);

  useEffect(() => {
    if (currentCompanyId) workspacesStore.announceCurrent();
  }, [currentCompanyId, workspacesStore]);

  useEffect(() => {
    function reloadRestoredPage(event: PageTransitionEvent) {
      if (event.persisted && workspacesStore.isNavigating) window.location.reload();
    }

    window.addEventListener("pageshow", reloadRestoredPage);
    return () => window.removeEventListener("pageshow", reloadRestoredPage);
  }, [workspacesStore]);

  const currentName = workspaceDisplayName(workspacesStore.current?.name, t("Workspaces.fallbackName"));

  return (
    <ConfirmDialog
      anchorScope="workspace-other-tab"
      confirmLabel={t("Workspaces.otherTab.reload")}
      confirmVariant="default"
      description={t("Workspaces.otherTab.description", { current: currentName })}
      open={notice !== null}
      title={
        notice?.deleted
          ? t("Workspaces.otherTab.titleDeleted")
          : notice?.name?.trim()
            ? t("Workspaces.otherTab.titleNamed", { name: notice.name.trim() })
            : notice?.companyId
              ? t("Workspaces.otherTab.title")
              : t("Workspaces.otherTab.titleChanged")
      }
      onConfirm={() => workspacesStore.followOtherTab()}
    />
  );
});
