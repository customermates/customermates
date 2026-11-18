"use client";

import type { WorkspaceLeave } from "@/features/workspace/get-workspace-leave.interactor";
import type { WorkspaceInactiveReason, WorkspaceSummary } from "@/features/workspace/workspace.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Status } from "@/generated/prisma";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { LeaveInactiveWorkspaceDialog } from "@/app/components/workspaces/leave-inactive-workspace-dialog";
import {
  LeaveWorkspaceButton,
  LeaveWorkspaceDialog,
  LeaveWorkspaceReason,
} from "@/app/components/workspaces/leave-workspace-dialog";
import { WorkspaceAvatar } from "@/app/components/workspaces/workspace-avatar";
import { workspaceDisplayName, workspaceListName } from "@/app/components/workspaces/workspace-identity";
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
  leaves: WorkspaceLeave[];
  workspaces: WorkspaceSummary[];
};

const WorkspacesPageViewContent = observer(({ leaves, workspaces }: Props) => {
  const t = useTranslations();
  const { appMode, createWorkspaceModalStore, workspacesStore } = useRootStore();
  const [activeLeave, setActiveLeave] = useState<{ companyId: string; name: string } | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [inactiveLeave, setInactiveLeave] = useState<{
    companyId: string;
    name: string;
    reason: WorkspaceInactiveReason | null;
  } | null>(null);
  const [confirmingInactiveLeave, setConfirmingInactiveLeave] = useState(false);
  const { canCreate } = workspacesStore;
  const fallback = t("Workspaces.fallbackName");

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
                const name = workspaceListName(workspace, workspaces, fallback, (date) =>
                  t("Workspaces.unnamedCreated", { name: fallback, date }),
                );
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
                const leave =
                  appMode === "demo" || workspace.status !== Status.active
                    ? null
                    : (leaves.find((entry) => entry.companyId === workspace.companyId) ?? null);
                const otherLeaveId = `settings-workspaces-leave-${workspace.companyId}`;
                const confirmLeave = (leaving: string) => {
                  setActiveLeave({ companyId: workspace.companyId, name: leaving });
                  setConfirmingLeave(true);
                };

                return (
                  <li
                    key={workspace.companyId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3"
                    data-workspace-id={workspace.companyId}
                  >
                    <WorkspaceAvatar
                      companyId={workspace.companyId}
                      logoUrl={workspace.logoUrl}
                      name={name}
                      size="lg"
                    />

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

                      {workspace.isCurrent ? null : (
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

                      {leave && workspace.isCurrent ? (
                        <LeaveWorkspaceButton
                          id="settings-workspaces-leave"
                          label={t("Workspaces.leaveShort")}
                          refusal={leave.refusal}
                          onClick={() => confirmLeave(workspaceDisplayName(workspace.name, fallback))}
                        />
                      ) : null}

                      {leave && !workspace.isCurrent ? (
                        <LeaveWorkspaceButton
                          ariaLabel={t("Workspaces.leaveNamed", { name })}
                          id={otherLeaveId}
                          label={t("Workspaces.leaveShort")}
                          refusal={leave.refusal}
                          variant="ghostDestructive"
                          onClick={() => confirmLeave(name)}
                        />
                      ) : null}

                      {appMode !== "demo" && !workspace.isCurrent && workspace.status === Status.inactive ? (
                        <Button
                          aria-label={t("Workspaces.leaveNamed", { name })}
                          data-slot="leave-inactive-workspace"
                          size="sm"
                          type="button"
                          variant="ghostDestructive"
                          onClick={() => {
                            setInactiveLeave({
                              companyId: workspace.companyId,
                              name,
                              reason: workspace.inactiveReason,
                            });
                            setConfirmingInactiveLeave(true);
                          }}
                        >
                          {t("Workspaces.leaveShort")}
                        </Button>
                      ) : null}
                    </div>

                    {leave && workspace.isCurrent ? (
                      <LeaveWorkspaceReason
                        className="basis-full"
                        id="settings-workspaces-leave"
                        refusal={leave.refusal}
                      />
                    ) : null}

                    {leave && !workspace.isCurrent ? (
                      <LeaveWorkspaceReason className="basis-full" id={otherLeaveId} refusal={leave.refusal} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </SectionRows>
        </AppCardBody>
      </AppCard>

      <LeaveWorkspaceDialog
        anchorScope="settings-workspaces-leave-confirm"
        companyId={activeLeave?.companyId ?? null}
        name={activeLeave?.name ?? fallback}
        open={confirmingLeave}
        onClose={() => setConfirmingLeave(false)}
      />

      <LeaveInactiveWorkspaceDialog
        anchorScope="settings-workspaces-leave-inactive-confirm"
        companyId={inactiveLeave?.companyId ?? null}
        name={inactiveLeave?.name ?? fallback}
        open={confirmingInactiveLeave}
        reason={inactiveLeave?.reason ?? null}
        onClose={() => setConfirmingInactiveLeave(false)}
      />
    </div>
  );
});

export const WorkspacesPageView = serverRenderedClient(WorkspacesPageViewContent);
