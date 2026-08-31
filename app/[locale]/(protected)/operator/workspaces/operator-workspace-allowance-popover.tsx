"use client";

import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { ClickableChip } from "@/components/chip/clickable-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { runUserAction } from "@/core/errors/report-application-error";

import { useOperatorErrorToast } from "../use-operator-error-toast";
import { updateOperatorEnterpriseAllowanceAction } from "./actions";

type Props = { workspace: OperatorWorkspaceRowDto; onCommitted: () => void };

export function OperatorWorkspaceAllowancePopover({ workspace, onCommitted }: Props) {
  const t = useTranslations();
  const format = useFormatter();
  const toastOperatorError = useOperatorErrorToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [credits, setCredits] = useState("");

  function onOpenChange(next: boolean) {
    setIsOpen(next);
    setCredits(next ? String(workspace.enterpriseCreditsPerUser ?? "") : "");
  }

  async function apply() {
    const creditsPerUser = Number(credits);
    if (!Number.isInteger(creditsPerUser) || creditsPerUser < 1) return;

    setIsPending(true);
    try {
      const result = await updateOperatorEnterpriseAllowanceAction({
        companyId: workspace.id,
        creditsPerUser,
        operationId: globalThis.crypto.randomUUID(),
      });

      if (result.status !== "success") {
        if (result.status === "error") toastOperatorError(result.errorCode);
        return;
      }

      setIsOpen(false);
      onCommitted();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button aria-label={t("OperatorWorkspaces.allowance.label")} type="button">
          <ClickableChip size="sm" variant="secondary">
            {workspace.enterpriseCreditsPerUser == null ? "-" : format.number(workspace.enterpriseCreditsPerUser)}
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
            disabled={isPending}
            inputMode="numeric"
            min={1}
            type="number"
            value={credits}
            onChange={(event) => setCredits(event.target.value)}
          />

          <Button disabled={isPending || !credits} size="sm" variant="secondary" onClick={() => runUserAction(apply)}>
            {t("Common.actions.save")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
