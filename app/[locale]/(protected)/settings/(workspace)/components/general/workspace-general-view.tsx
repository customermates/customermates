"use client";

import type { WorkspaceLeaveRefusal } from "@/features/workspace/member-removal-refusal";
import type { WorkspaceSummary } from "@/features/workspace/workspace.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { LeaveWorkspaceButton, LeaveWorkspaceDialog } from "@/app/components/workspaces/leave-workspace-dialog";
import { WorkspaceAvatar } from "@/app/components/workspaces/workspace-avatar";
import { workspaceDisplayName } from "@/app/components/workspaces/workspace-identity";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { UnsavedChangesBar, unsavedChangesMode } from "@/components/forms/unsaved-changes-bar";
import { Alert } from "@/components/shared/alert";
import { useRootStore } from "@/core/stores/root-store.provider";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { WORKSPACE_NAME_MAX_LENGTH } from "@/features/workspace/workspace.schema";

type Props = {
  leaveRefusal: WorkspaceLeaveRefusal | null;
  workspace: WorkspaceSummary;
};

const WorkspaceGeneralViewContent = observer(({ leaveRefusal, workspace }: Props) => {
  const t = useTranslations();
  const { appMode, workspaceGeneralStore: store } = useRootStore();
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  useState(() => {
    store.onInitOrRefresh({ name: workspace.name ?? "" });
  });

  useEffect(() => store.onInitOrRefresh({ name: workspace.name ?? "" }), [store, workspace.name]);

  const demo = appMode === "demo";
  const name = workspaceDisplayName(store.savedState.name, t("Workspaces.fallbackName"));
  const editable = store.canManage && !store.isReadOnly && !demo;

  return (
    <>
      <AppForm store={store}>
        <div className="animate-page-result-in flex w-full max-w-3xl flex-col gap-6 motion-reduce:animate-none">
          <div className="flex min-w-0 items-center gap-3">
            <WorkspaceAvatar companyId={workspace.companyId} name={name} size="xl" />

            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{name}</span>

              {workspace.activeMemberCount === null ? null : (
                <span className="text-sm text-subdued">
                  {t("Workspaces.memberCount", { count: workspace.activeMemberCount })}
                </span>
              )}
            </div>
          </div>

          <FormInput
            description={editable ? t("Workspaces.nameDescription") : t("Workspaces.renameReadOnly")}
            id="name"
            inputId="settings-general-name"
            label={t("Workspaces.nameLabel")}
            maxLength={WORKSPACE_NAME_MAX_LENGTH}
            readOnly={!editable}
            required={editable}
          />

          {unsavedChangesMode({ dirty: store.hasUnsavedChanges, editable }) === "bar" && (
            <UnsavedChangesBar
              anchorScope="settings-general"
              placement="sticky"
              saving={store.isLoading}
              onCancel={store.resetForm}
            />
          )}

          {demo ? null : (
            <section aria-labelledby="settings-general-danger-zone" className="flex flex-col gap-3">
              <h2 className="text-sm font-medium" id="settings-general-danger-zone">
                {t("Workspaces.dangerZone")}
              </h2>

              <Alert
                color="danger"
                description={t("Workspaces.leaveDescription")}
                role="note"
                title={t("Workspaces.leave")}
              >
                <LeaveWorkspaceButton
                  className="mt-2"
                  id="settings-general-leave"
                  label={t("Workspaces.leave")}
                  refusal={leaveRefusal}
                  onClick={() => setConfirmingLeave(true)}
                />
              </Alert>
            </section>
          )}
        </div>
      </AppForm>

      <LeaveWorkspaceDialog
        anchorScope="settings-general-leave-confirm"
        name={name}
        open={confirmingLeave}
        onClose={() => setConfirmingLeave(false)}
      />
    </>
  );
});

export const WorkspaceGeneralView = serverRenderedClient(WorkspaceGeneralViewContent);
