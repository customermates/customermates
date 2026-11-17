"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  anchorScope: string;
  companyId: string | null;
  name: string;
  open: boolean;
  pausedByPlan?: boolean;
  onClose: () => void;
};

export const LeaveInactiveWorkspaceDialog = observer(
  ({ anchorScope, companyId, name, open, pausedByPlan = false, onClose }: Props) => {
    const t = useTranslations();
    const { workspacesStore } = useRootStore();

    return (
      <ConfirmDialog
        anchorScope={anchorScope}
        confirmLabel={t("Workspaces.leaveShort")}
        description={
          pausedByPlan ? t("Workspaces.leavePausedConfirmDescription") : t("Workspaces.leaveInactiveConfirmDescription")
        }
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
