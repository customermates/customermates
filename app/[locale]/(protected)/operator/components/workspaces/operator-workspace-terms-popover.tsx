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

function toDateInput(value: Date | null): string {
  if (!value) return "";
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function OperatorWorkspaceTermsPopover({ workspace }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { operatorWorkspacesStore } = useRootStore();
  const { showConfirmation } = useDeleteConfirmation();
  const [isOpen, setIsOpen] = useState(false);
  const [trialEnd, setTrialEnd] = useState("");
  const [billingId, setBillingId] = useState("");

  const clearingBinding = Boolean(workspace.lemonSqueezyId) && billingId.trim().length === 0;

  function onOpenChange(next: boolean) {
    setIsOpen(next);
    setTrialEnd(next ? toDateInput(workspace.trialEndDate) : "");
    setBillingId(next ? (workspace.lemonSqueezyId ?? "") : "");
  }

  function apply() {
    const trimmedId = billingId.trim();
    const nextTrialEnd = trialEnd ? new Date(`${trialEnd}T23:59:59.999`) : null;
    if (nextTrialEnd && !Number.isFinite(nextTrialEnd.getTime())) return;

    showConfirmation({
      title: t("OperatorConsole.confirm.title"),
      message: clearingBinding
        ? t("OperatorConsole.confirm.termsClearingBilling", { name: workspace.workspaceLabel })
        : t("OperatorConsole.confirm.terms", { name: workspace.workspaceLabel }),
      confirmLabel: t("Common.actions.confirm"),
      confirmVariant: clearingBinding ? "destructive" : "default",
      successKey: "Common.notifications.updated",
      onConfirm: async () => {
        const committed = await operatorWorkspacesStore.updateSubscriptionTerms({
          companyId: workspace.id,
          trialEndDate: nextTrialEnd ? nextTrialEnd.toISOString() : null,
          lemonSqueezyId: trimmedId.length > 0 ? trimmedId : null,
        });
        if (committed) setIsOpen(false);
        return committed;
      },
    });
  }

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button aria-label={t("OperatorWorkspaces.terms.label")} type="button">
          <ClickableChip size="sm" variant="secondary">
            {workspace.trialEndDate
              ? intlStore.formatNumericalShortDate(workspace.trialEndDate)
              : t("OperatorWorkspaces.terms.noTrial")}
          </ClickableChip>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="flex w-80 flex-col gap-3">
        <div className="space-y-1">
          <h3 className="text-x-sm font-medium">{t("OperatorWorkspaces.terms.title")}</h3>

          <p className="text-xs text-muted-foreground">{t("OperatorWorkspaces.terms.description")}</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor={`trial-${workspace.id}`}>
            {t("OperatorWorkspaces.terms.trialEnd")}
          </label>

          <Input
            aria-label={t("OperatorWorkspaces.terms.trialEnd")}
            id={`trial-${workspace.id}`}
            type="date"
            value={trialEnd}
            onChange={(event) => setTrialEnd(event.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor={`billing-${workspace.id}`}>
            {t("OperatorWorkspaces.terms.billingId")}
          </label>

          <Input
            aria-label={t("OperatorWorkspaces.terms.billingId")}
            autoComplete="off"
            id={`billing-${workspace.id}`}
            placeholder={t("OperatorWorkspaces.terms.billingIdPlaceholder")}
            value={billingId}
            onChange={(event) => setBillingId(event.target.value)}
          />
        </div>

        {clearingBinding ? (
          <p className="text-xs text-destructive">{t("OperatorWorkspaces.terms.billingWarning")}</p>
        ) : null}

        <Button size="sm" variant="secondary" onClick={apply}>
          {t("Common.actions.save")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
