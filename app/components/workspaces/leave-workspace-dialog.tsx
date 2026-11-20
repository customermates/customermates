"use client";

import type { WorkspaceLeaveRefusal } from "@/features/workspace/member-removal-refusal";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { useRootStore } from "@/core/stores/root-store.provider";

import { BlockableWorkspaceButton, BlockableWorkspaceReason } from "./blockable-workspace-action";

type Props = {
  anchorScope: string;
  companyId?: string | null;
  name: string;
  open: boolean;
  onClose: () => void;
};

type ButtonProps = {
  ariaLabel?: string;
  className?: string;
  fullWidth?: boolean;
  id: string;
  label: string;
  refusal: WorkspaceLeaveRefusal | null;
  size?: "sm" | "default";
  variant?: "secondary" | "ghostDestructive";
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

export function LeaveWorkspaceButton({
  ariaLabel,
  className,
  fullWidth,
  id,
  label,
  refusal,
  size,
  variant,
  onClick,
}: ButtonProps) {
  return (
    <BlockableWorkspaceButton
      ariaLabel={ariaLabel}
      blocker={useLeaveBlocker(refusal)}
      className={className}
      fullWidth={fullWidth}
      id={id}
      label={label}
      size={size}
      slot="leave-workspace"
      variant={variant}
      onClick={onClick}
    />
  );
}

export const LeaveWorkspaceDialog = observer(({ anchorScope, companyId, name, open, onClose }: Props) => {
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
        const left = companyId ? workspacesStore.leaveActive(companyId) : workspacesStore.leaveCurrent();
        if (!(await left)) onClose();
      }}
    />
  );
});
