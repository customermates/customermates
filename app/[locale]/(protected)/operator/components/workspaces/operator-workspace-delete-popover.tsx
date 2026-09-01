"use client";

import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = { workspace: OperatorWorkspaceRowDto };

export function OperatorWorkspaceDeletePopover({ workspace }: Props) {
  const t = useTranslations();
  const { operatorWorkspacesStore } = useRootStore();
  const { showConfirmation } = useDeleteConfirmation();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmLabel, setConfirmLabel] = useState("");
  const [reason, setReason] = useState("");

  const labelMatches = confirmLabel === workspace.workspaceLabel;
  const canDelete = labelMatches && reason.trim().length > 0;

  function onOpenChange(next: boolean) {
    setIsOpen(next);
    setConfirmLabel("");
    setReason("");
  }

  function apply() {
    if (!canDelete) return;

    showConfirmation({
      title: t("OperatorWorkspaces.delete.confirmTitle"),
      message: t("OperatorWorkspaces.delete.confirmMessage", {
        name: workspace.workspaceLabel,
        members: workspace.userCount,
      }),
      confirmLabel: t("Common.actions.delete"),
      confirmVariant: "destructive",
      successKey: "Common.notifications.deleted",
      onConfirm: async () => {
        const committed = await operatorWorkspacesStore.deleteWorkspace({
          companyId: workspace.id,
          confirmWorkspaceLabel: confirmLabel,
          reason: reason.trim(),
        });
        if (committed) setIsOpen(false);
        return committed;
      },
    });
  }

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button aria-label={t("OperatorWorkspaces.delete.label")} size="icon" variant="ghost">
          <Trash2 className="text-destructive" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="flex w-80 flex-col gap-3">
        <div className="space-y-1">
          <h3 className="text-x-sm font-medium text-destructive">{t("OperatorWorkspaces.delete.title")}</h3>

          <p className="text-xs text-muted-foreground">
            {t("OperatorWorkspaces.delete.warningDescription", {
              name: workspace.workspaceLabel,
              members: workspace.userCount,
            })}
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor={`confirm-${workspace.id}`}>
            {t("OperatorWorkspaces.delete.confirmLabel", { name: workspace.workspaceLabel })}
          </label>

          <Input
            aria-label={t("OperatorWorkspaces.delete.confirmLabel", { name: workspace.workspaceLabel })}
            autoComplete="off"
            id={`confirm-${workspace.id}`}
            value={confirmLabel}
            onChange={(event) => setConfirmLabel(event.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor={`reason-${workspace.id}`}>
            {t("OperatorWorkspaces.delete.reasonLabel")}
          </label>

          <Input
            aria-label={t("OperatorWorkspaces.delete.reasonLabel")}
            autoComplete="off"
            id={`reason-${workspace.id}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        <Button disabled={!canDelete} size="sm" variant="destructive" onClick={apply}>
          {t("OperatorWorkspaces.delete.action")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
