"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  anchorScope: string;
  name: string;
  open: boolean;
  onClose: () => void;
};

export const LeaveWorkspaceDialog = observer(({ anchorScope, name, open, onClose }: Props) => {
  const t = useTranslations();
  const { workspacesStore } = useRootStore();

  return (
    <ConfirmDialog
      anchorScope={anchorScope}
      confirmLabel={t("Workspaces.leaveShort")}
      description={t("Workspaces.leaveConfirmDescription")}
      open={open}
      title={t("Workspaces.leaveConfirmTitle", { name })}
      onCancel={onClose}
      onConfirm={async () => {
        if (!(await workspacesStore.leaveCurrent())) onClose();
      }}
    />
  );
});
