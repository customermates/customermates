"use client";

import type { WorkspaceLeaveRefusal } from "@/features/workspace/member-removal-refusal";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";

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

function leaveReasonId(id: string): string {
  return `${id}-reason`;
}

export function LeaveWorkspaceReason({ className, id, refusal }: ReasonProps) {
  const blocker = useLeaveBlocker(refusal);
  if (!blocker) return null;

  return (
    <p
      className={cn("hidden text-xs text-subdued max-sm:block pointer-coarse:block", className)}
      data-slot="leave-workspace-reason"
      id={leaveReasonId(id)}
    >
      {blocker}
    </p>
  );
}

export function LeaveWorkspaceButton({ className, id, label, refusal, onClick }: ButtonProps) {
  const blocker = useLeaveBlocker(refusal);
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
          aria-describedby={leaveReasonId(id)}
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
