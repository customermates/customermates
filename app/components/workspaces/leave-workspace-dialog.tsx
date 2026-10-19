"use client";

import type { WorkspaceLeaveRefusal } from "@/features/workspace/member-removal-refusal";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { useRootStore } from "@/core/stores/root-store.provider";

import { BlockableWorkspaceButton, BlockableWorkspaceReason } from "./blockable-workspace-action";

type Props = {
  anchorScope: string;
  name: string;
  open: boolean;
  onClose: () => void;
};

type ButtonProps = {
  className?: string;
  id: string;
  label: string;
  refusal: WorkspaceLeaveRefusal | null;
  onClick: () => void;
};

type ReasonProps = {
  className?: string;
  id: string;
  refusal: WorkspaceLeaveRefusal | null;
};

function useLeaveBlocker(refusal: WorkspaceLeaveRefusal | null): string | null {
  const t = useTranslations();
  if (refusal === "lastAdmin") return t("Common.errors.workspaceLastAdmin");
  if (refusal === "platformOperator") return t("MemberRemoval.blocked.platformOperator");
  return null;
}

export function LeaveWorkspaceReason({ className, id, refusal }: ReasonProps) {
  return (
    <BlockableWorkspaceReason blocker={useLeaveBlocker(refusal)} className={className} id={id} slot="leave-workspace" />
  );
}

export function LeaveWorkspaceButton({ className, id, label, refusal, onClick }: ButtonProps) {
  return (
    <BlockableWorkspaceButton
      blocker={useLeaveBlocker(refusal)}
      className={className}
      id={id}
      label={label}
      slot="leave-workspace"
      onClick={onClick}
    />
  );
}

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
