"use client";

import type { WorkspaceDeleteRefusal } from "@/features/workspace/workspace-deletion-refusal";

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
  fullWidth?: boolean;
  id: string;
  refusal: WorkspaceDeleteRefusal | null;
  size?: "sm" | "default";
  variant?: "secondary" | "ghostDestructive";
  onClick: () => void;
};

type ReasonProps = {
  className?: string;
  id: string;
  refusal: WorkspaceDeleteRefusal | null;
};

function useDeleteBlocker(refusal: WorkspaceDeleteRefusal | null): string | null {
  const t = useTranslations();
  switch (refusal) {
    case "notAdmin":
      return t("Workspaces.deleteBlocked.notAdmin");
    case "notCreator":
      return t("Workspaces.deleteBlocked.notCreator");
    case "platformOperator":
      return t("Workspaces.deleteBlocked.platformOperator");
    case "invoiced":
      return t("Workspaces.deleteBlocked.invoiced");
    case "billingActive":
      return t("Workspaces.deleteBlocked.billingActive");
    case "checkoutPending":
      return t("Workspaces.deleteBlocked.checkoutPending");
    case null:
      return null;
  }
}

export function DeleteWorkspaceReason({ className, id, refusal }: ReasonProps) {
  return (
    <BlockableWorkspaceReason
      blocker={useDeleteBlocker(refusal)}
      className={className}
      id={id}
      slot="delete-workspace"
    />
  );
}

export function DeleteWorkspaceButton({ className, fullWidth, id, refusal, size, variant, onClick }: ButtonProps) {
  const t = useTranslations();

  return (
    <BlockableWorkspaceButton
      blocker={useDeleteBlocker(refusal)}
      className={className}
      fullWidth={fullWidth}
      id={id}
      label={t("Workspaces.delete")}
      size={size}
      slot="delete-workspace"
      variant={variant}
      onClick={onClick}
    />
  );
}

export const DeleteWorkspaceDialog = observer(({ anchorScope, name, open, onClose }: Props) => {
  const t = useTranslations();
  const { workspacesStore } = useRootStore();

  return (
    <ConfirmDialog
      anchorScope={anchorScope}
      confirmLabel={t("Common.actions.delete")}
      confirmationText={name}
      description={t("Workspaces.deleteConfirmDescription")}
      open={open}
      title={t("Workspaces.deleteConfirmTitle", { name })}
      onCancel={onClose}
      onConfirm={async () => {
        if (!(await workspacesStore.deleteCurrent())) onClose();
      }}
    />
  );
});
