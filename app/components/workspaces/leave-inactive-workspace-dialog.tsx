"use client";

import type { WorkspaceInactiveReason } from "@/features/workspace/workspace.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  anchorScope: string;
  companyId: string | null;
  name: string;
  open: boolean;
  reason: WorkspaceInactiveReason | null;
  onClose: () => void;
};

export const LeaveInactiveWorkspaceDialog = observer(
  ({ anchorScope, companyId, name, open, reason, onClose }: Props) => {
    const t = useTranslations();
    const { workspacesStore } = useRootStore();
    const description =
      reason === "pausedByPlan"
        ? t("Workspaces.leavePausedConfirmDescription")
        : reason === "noActiveAdmin"
          ? t("Workspaces.leaveNoAdminConfirmDescription")
          : t("Workspaces.leaveInactiveConfirmDescription");

    return (
      <ConfirmDialog
        anchorScope={anchorScope}
        confirmLabel={t("Workspaces.leaveShort")}
        description={description}
        open={open}
        title={t("Workspaces.leaveConfirmTitle", { name })}
        onCancel={onClose}
        onConfirm={async () => {
          if (!companyId || !(await workspacesStore.leaveInactive(companyId))) onClose();
        }}
      />
    );
  },
);
