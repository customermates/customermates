"use client";

import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ClickableChip } from "@/components/chip/clickable-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

type Props = { workspace: OperatorWorkspaceRowDto };

export function OperatorWorkspaceAllowancePopover({ workspace }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { operatorWorkspacesStore } = useRootStore();
  const { showConfirmation } = useDeleteConfirmation();
  const [isOpen, setIsOpen] = useState(false);
  const [credits, setCredits] = useState("");

  function onOpenChange(next: boolean) {
    setIsOpen(next);
    setCredits(next ? String(workspace.enterpriseCreditsPerUser ?? "") : "");
  }

  function apply() {
    const creditsPerUser = Number(credits);
    if (!Number.isInteger(creditsPerUser) || creditsPerUser < 1) return;

    showConfirmation({
      title: t("OperatorConsole.confirm.title"),
      message: t("OperatorConsole.confirm.allowance", {
        name: workspace.workspaceLabel,
        value: intlStore.formatNumber(creditsPerUser),
      }),
      confirmLabel: t("Common.actions.confirm"),
      confirmVariant: "default",
      successKey: "Common.notifications.updated",
      onConfirm: async () => {
        const committed = await operatorWorkspacesStore.updateEnterpriseAllowance({
          companyId: workspace.id,
          creditsPerUser,
        });
        if (committed) setIsOpen(false);
        return committed;
      },
    });
  }

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button aria-label={t("OperatorWorkspaces.allowance.label")} type="button">
          <ClickableChip size="sm" variant="secondary">
            {workspace.enterpriseCreditsPerUser == null
              ? "-"
              : intlStore.formatNumber(workspace.enterpriseCreditsPerUser)}
          </ClickableChip>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="flex w-72 flex-col gap-3">
        <div className="space-y-1">
          <h3 className="text-x-sm font-medium">{t("OperatorWorkspaces.allowance.title")}</h3>

          <p className="text-xs text-muted-foreground">{t("OperatorWorkspaces.allowance.warningDescription")}</p>
        </div>

        <div className="flex items-end gap-2">
          <Input
            aria-label={t("OperatorWorkspaces.allowance.label")}
            inputMode="numeric"
            min={1}
            type="number"
            value={credits}
            onChange={(event) => setCredits(event.target.value)}
          />

          <Button disabled={!credits} size="sm" variant="secondary" onClick={apply}>
            {t("Common.actions.save")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
