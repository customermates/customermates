"use client";

import type { OperatorUserDetailDto } from "@/ee/operator/operator.schema";
import type { OperatorUserRowDto } from "@/ee/operator/operator-lists.schema";

import { CircleDollarSign } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { InfoRow } from "@/components/shared/info-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { runUserAction } from "@/core/errors/report-application-error";

import { useOperatorErrorToast } from "../use-operator-error-toast";
import {
  createOperatorUserCreditAdjustmentAction,
  getOperatorUserDetailAction,
  resetOperatorUserCreditsAction,
} from "./actions";

type Props = { user: OperatorUserRowDto; onCommitted: () => void };

export function OperatorUserCreditsPopover({ user, onCommitted }: Props) {
  const t = useTranslations();
  const format = useFormatter();
  const toastOperatorError = useOperatorErrorToast();
  const { showConfirmation } = useDeleteConfirmation();
  const [isOpen, setIsOpen] = useState(false);
  const [detail, setDetail] = useState<OperatorUserDetailDto | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [delta, setDelta] = useState("");

  const period = detail?.creditPeriod ?? null;
  const name = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const integer = (value: number) => format.number(value, { maximumFractionDigits: 0 });

  async function load() {
    setIsPending(true);
    setDetail(null);
    try {
      const result = await getOperatorUserDetailAction(user.id);
      if (result.status === "success") setDetail(result.data);
      else if (result.status === "error") toastOperatorError(result.errorCode);
    } finally {
      setIsPending(false);
    }
  }

  function onOpenChange(next: boolean) {
    setIsOpen(next);
    setDelta("");
    if (next) runUserAction(load);
  }

  async function applyCorrection() {
    const creditDelta = Number(delta);
    if (!period || !Number.isInteger(creditDelta) || creditDelta === 0) return;

    setIsPending(true);
    try {
      const result = await createOperatorUserCreditAdjustmentAction({
        companyId: user.companyId,
        userId: user.id,
        creditDelta,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        operationId: globalThis.crypto.randomUUID(),
      });

      if (result.status !== "success") {
        if (result.status === "error") toastOperatorError(result.errorCode);
        return;
      }

      setDelta("");
      setDetail(result.data.user);
      onCommitted();
    } finally {
      setIsPending(false);
    }
  }

  function confirmReset(mode: "baseAllowance" | "zeroBalance", label: string) {
    if (!period) return;
    setIsOpen(false);

    const operationId = globalThis.crypto.randomUUID();

    showConfirmation({
      title: t("OperatorUsers.reset.title"),
      message: t("OperatorUsers.confirm.reset", { name, value: label }),
      confirmLabel: t("Common.actions.confirm"),
      successKey: "Common.notifications.updated",
      onConfirm: async () => {
        const result = await resetOperatorUserCreditsAction({
          userId: user.id,
          mode,
          expectedPeriodStart: period.periodStart,
          expectedPeriodEnd: period.periodEnd,
          expectedBaseAllowanceCredits: period.baseAllowanceCredits,
          expectedAdjustmentCredits: period.adjustmentCredits,
          expectedCommittedCredits: period.committedCredits,
          operationId,
        });

        if (result.status !== "success") {
          if (result.status === "error") toastOperatorError(result.errorCode);
          return false;
        }

        onCommitted();
        return true;
      },
    });
  }

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button aria-label={t("OperatorUsers.credits.title")} size="icon" variant="ghost">
          <CircleDollarSign aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="flex w-80 flex-col gap-3">
        <h3 className="text-x-sm font-medium">{t("OperatorUsers.credits.title")}</h3>

        {isPending && !period ? <Skeleton className="h-24 w-full" /> : null}

        {!isPending && !period ? (
          <p className="text-xs text-muted-foreground">{t("OperatorUsers.credits.unavailableDescription")}</p>
        ) : null}

        {period ? (
          <>
            <div className="flex flex-col gap-1.5">
              <InfoRow label={t("OperatorUsers.credits.remaining")}>{integer(period.remainingCredits)}</InfoRow>

              <InfoRow label={t("OperatorUsers.credits.base")}>{integer(period.baseAllowanceCredits)}</InfoRow>

              <InfoRow label={t("OperatorUsers.credits.adjustments")}>{integer(period.adjustmentCredits)}</InfoRow>

              <InfoRow label={t("OperatorUsers.credits.committed")}>{integer(period.committedCredits)}</InfoRow>
            </div>

            <div className="flex items-end gap-2">
              <Input
                aria-label={t("OperatorUsers.adjustment.deltaLabel")}
                disabled={isPending}
                inputMode="numeric"
                placeholder={t("OperatorUsers.adjustment.deltaPlaceholder")}
                type="number"
                value={delta}
                onChange={(event) => setDelta(event.target.value)}
              />

              <Button
                disabled={isPending || !delta}
                size="sm"
                variant="secondary"
                onClick={() => runUserAction(applyCorrection)}
              >
                {t("Common.actions.save")}
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                className="w-full"
                disabled={isPending}
                size="sm"
                variant="secondary"
                onClick={() => confirmReset("baseAllowance", t("OperatorUsers.reset.baseAllowance"))}
              >
                {t("OperatorUsers.reset.baseAllowance")}
              </Button>

              <Button
                className="w-full"
                disabled={isPending}
                size="sm"
                variant="destructiveOutline"
                onClick={() => confirmReset("zeroBalance", t("OperatorUsers.reset.zeroBalance"))}
              >
                {t("OperatorUsers.reset.zeroBalance")}
              </Button>
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
