"use client";

import type { OperatorUserDetailDto } from "@/ee/operator/operator.schema";
import type { OperatorUserRowDto } from "@/ee/operator/operator-lists.schema";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { ClickableChip } from "@/components/chip/clickable-chip";
import { InfoRow } from "@/components/shared/info-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "@/i18n/navigation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { getOperatorUserDetailAction } from "../../users/actions";

type Props = { user: OperatorUserRowDto };

export function OperatorUserCreditsPopover({ user }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { operatorUsersStore } = useRootStore();
  const { showConfirmation } = useDeleteConfirmation();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [detail, setDetail] = useState<OperatorUserDetailDto | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [delta, setDelta] = useState("");

  const period = detail?.creditPeriod ?? null;
  const allowanceMissing = period?.blockedReason === "enterprise_allowance_missing";
  const name = `${user.firstName} ${user.lastName}`.trim() || user.email;

  async function load() {
    setIsLoadingDetail(true);
    setDetail(null);
    try {
      const res = await getOperatorUserDetailAction({ userId: user.id });
      if (res.ok) setDetail(res.data);
      else toastZodErrorTree(res.error);
    } finally {
      setIsLoadingDetail(false);
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

    const committed = await operatorUsersStore.applyCreditCorrection({
      companyId: user.companyId,
      userId: user.id,
      creditDelta,
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd.toISOString(),
      operationId: globalThis.crypto.randomUUID(),
    });
    if (!committed) return;

    setDelta("");
    await load();
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
      onConfirm: () =>
        operatorUsersStore.resetCredits({
          userId: user.id,
          mode,
          operationId,
        }),
    });
  }

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button aria-label={t("OperatorUsers.credits.title")} type="button">
          <ClickableChip size="sm" variant="secondary">
            {user.creditsBlockedReason === "enterprise_allowance_missing"
              ? t("OperatorUsers.credits.allowanceMissingShort")
              : user.creditsLimit === null
                ? t("OperatorUsers.credits.noneShort")
                : t("OperatorUsers.credits.position", {
                    remaining: intlStore.formatNumber(user.creditsRemaining ?? 0),
                    limit: intlStore.formatNumber(user.creditsLimit),
                  })}
          </ClickableChip>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="flex w-80 flex-col gap-3">
        <h3 className="text-x-sm font-medium">{t("OperatorUsers.credits.title")}</h3>

        {isLoadingDetail ? <Skeleton className="h-24 w-full" /> : null}

        {!isLoadingDetail && detail && !period ? (
          <p className="text-xs text-muted-foreground">{t("OperatorUsers.credits.unavailableDescription")}</p>
        ) : null}

        {period ? (
          <>
            <div className="flex flex-col gap-1.5">
              <InfoRow label={t("OperatorUsers.credits.remaining")}>
                {intlStore.formatNumber(period.remainingCredits)}
              </InfoRow>

              <InfoRow label={t("OperatorUsers.credits.base")}>
                {intlStore.formatNumber(period.baseAllowanceCredits)}
              </InfoRow>

              <InfoRow label={t("OperatorUsers.credits.adjustments")}>
                {intlStore.formatNumber(period.adjustmentCredits)}
              </InfoRow>

              <InfoRow label={t("OperatorUsers.credits.committed")}>
                {intlStore.formatNumber(period.committedCredits)}
              </InfoRow>
            </div>

            {allowanceMissing ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  {t("OperatorUsers.credits.allowanceMissingDescription")}
                </p>

                <Button
                  className="w-full"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setIsOpen(false);
                    router.push(`/operator/workspaces?searchTerm=${encodeURIComponent(user.email)}`);
                  }}
                >
                  {t("OperatorUsers.credits.setAllowance")}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-end gap-2">
                  <Input
                    aria-label={t("OperatorUsers.adjustment.deltaLabel")}
                    inputMode="numeric"
                    placeholder={t("OperatorUsers.adjustment.deltaPlaceholder")}
                    type="number"
                    value={delta}
                    onChange={(event) => setDelta(event.target.value)}
                  />

                  <Button
                    disabled={!delta}
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
                    size="sm"
                    variant="secondary"
                    onClick={() => confirmReset("baseAllowance", t("OperatorUsers.reset.baseAllowance"))}
                  >
                    {t("OperatorUsers.reset.baseAllowance")}
                  </Button>

                  <Button
                    className="w-full"
                    size="sm"
                    variant="destructiveOutline"
                    onClick={() => confirmReset("zeroBalance", t("OperatorUsers.reset.zeroBalance"))}
                  >
                    {t("OperatorUsers.reset.zeroBalance")}
                  </Button>
                </div>
              </>
            )}
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
