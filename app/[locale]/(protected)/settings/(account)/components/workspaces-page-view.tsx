"use client";

import type { WorkspaceSummary } from "@/features/workspace/workspace.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Status } from "@/generated/prisma";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { LeaveWorkspaceDialog } from "@/app/components/workspaces/leave-workspace-dialog";
import { WorkspaceAvatar } from "@/app/components/workspaces/workspace-avatar";
import { workspaceDisplayName } from "@/app/components/workspaces/workspace-identity";
import { workspacePlanChip } from "@/app/components/workspaces/workspace-plan-chip";
import { WorkspaceStatusChip } from "@/app/components/workspaces/workspace-status-chip";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppChip } from "@/components/chip/app-chip";
import { TopBarPrimaryButton } from "@/components/shared/top-bar-action-buttons";
import { Button } from "@/components/ui/button";
import { SectionRows } from "@/components/ui/section-rows";
import { useRootStore } from "@/core/stores/root-store.provider";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { roleDisplayName } from "@/features/role/role-display-name";

type Props = {
  workspaces: WorkspaceSummary[];
};

const WorkspacesPageViewContent = observer(({ workspaces }: Props) => {
  const t = useTranslations();
  const { appMode, createWorkspaceModalStore, workspacesStore } = useRootStore();
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const { canCreate } = workspacesStore;
  const fallback = t("Workspaces.fallbackName");
  const current = workspaces.find((workspace) => workspace.isCurrent) ?? null;
  const currentName = workspaceDisplayName(current?.name, fallback);
  const canLeaveCurrent = appMode !== "demo" && current?.status === Status.active;

  const topBarActions = useMemo(
    () =>
      canCreate ? (
        <TopBarPrimaryButton
          anchorId="settings-workspaces-create"
          label={t("Workspaces.create")}
          onClick={() => createWorkspaceModalStore.start(document.getElementById("settings-workspaces-create"))}
        />
      ) : null,
    [canCreate, createWorkspaceModalStore, t],
  );
  useSetTopBarActions(topBarActions);

  return (
    <div className="animate-page-result-in flex w-full max-w-3xl flex-col gap-4 motion-reduce:animate-none">
      <p className="text-sm text-subdued">{t("Workspaces.listDescription")}</p>

      <AppCard>
        <AppCardBody className="py-0">
          <SectionRows asChild>
            <ul className="flex flex-col">
              {workspaces.map((workspace) => {
                const name = workspaceDisplayName(workspace.name, fallback);
                const role =
                  workspace.roleName === null
                    ? null
                    : roleDisplayName(
                        { isSystemRole: workspace.isAdmin, name: workspace.roleName },
                        t("RoleModal.systemName"),
                      );
                const members =
                  workspace.activeMemberCount === null
                    ? null
                    : t("Workspaces.memberCount", { count: workspace.activeMemberCount });
                const details = [role, members].filter(Boolean).join(" · ");
                const plan = appMode === "self-hosted" ? null : workspacePlanChip(workspace.subscription, t);

                return (
                  <li
                    key={workspace.companyId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3"
                    data-workspace-id={workspace.companyId}
                  >
                    <WorkspaceAvatar companyId={workspace.companyId} name={name} size="lg" />

                    <div className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium">{name}</span>

                        {workspace.isCurrent ? (
                          <AppChip className="shrink-0" size="sm">
                            {t("Workspaces.current")}
                          </AppChip>
                        ) : null}

                        <WorkspaceStatusChip status={workspace.status} />
                      </div>

                      {details ? <span className="truncate text-xs text-subdued">{details}</span> : null}
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      {plan ? (
                        <AppChip size="sm" variant={plan.variant}>
                          {plan.label}
                        </AppChip>
                      ) : null}

                      {workspace.isCurrent ? (
                        canLeaveCurrent ? (
                          <Button
                            id="settings-workspaces-leave"
                            size="sm"
                            type="button"
                            variant="secondary"
                            onClick={() => setConfirmingLeave(true)}
                          >
                            {t("Workspaces.leaveShort")}
                          </Button>
                        ) : null
                      ) : (
                        <Button
                          aria-label={t("Workspaces.switchTo", { name })}
                          size="sm"
                          type="button"
                          variant="secondary"
                          onClick={() => workspacesStore.requestSwitch(workspace.companyId)}
                        >
                          {t("Workspaces.switch")}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </SectionRows>
        </AppCardBody>
      </AppCard>

      <LeaveWorkspaceDialog
        anchorScope="settings-workspaces-leave-confirm"
        name={currentName}
        open={confirmingLeave}
        onClose={() => setConfirmingLeave(false)}
      />
    </div>
  );
});

export const WorkspacesPageView = serverRenderedClient(WorkspacesPageViewContent);
