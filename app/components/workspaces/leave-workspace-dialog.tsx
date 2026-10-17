"use client";

import type { WorkspaceLeaveRefusal } from "@/features/workspace/member-removal-refusal";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRootStore } from "@/core/stores/root-store.provider";

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

export function LeaveWorkspaceButton({ className, id, label, refusal, onClick }: ButtonProps) {
  const t = useTranslations();
  const blocker =
    refusal === "lastAdmin"
      ? t("Common.errors.workspaceLastAdmin")
      : refusal === "platformOperator"
        ? t("MemberRemoval.blocked.platformOperator")
        : null;
  const button = (
    <Button
      className={className}
      disabled={blocker !== null}
      id={id}
      size="sm"
      type="button"
      variant="secondary"
      onClick={onClick}
    >
      {label}
    </Button>
  );
  if (!blocker) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-disabled="true"
          aria-label={label}
          className="inline-flex w-fit"
          data-slot="leave-workspace-blocked"
          role="button"
          tabIndex={0}
        >
          {button}
        </span>
      </TooltipTrigger>

      <TooltipContent>{blocker}</TooltipContent>
    </Tooltip>
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
