"use client";

import type { OperatorUserDetailDto } from "@/ee/operator/operator.schema";
import type { OperatorUserRowDto } from "@/ee/operator/operator-lists.schema";
import type { Status } from "@/generated/prisma";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppChip } from "@/components/chip/app-chip";
import { InfoRow } from "@/components/shared/info-row";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/forms/form-label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useRouter } from "@/i18n/navigation";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { OperatorChipSelect } from "../operator-chip-select";
import { PLATFORM_ACCESS_GRANTED, useOperatorChipOptions } from "../use-operator-chip-options";
import { getOperatorUserDetailAction } from "../../users/actions";

type Props = { user: OperatorUserRowDto | null; onClose: () => void };

export const OperatorUserModal = observer(function OperatorUserModal({ user, onClose }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const router = useRouter();
  const { operatorUsersStore } = useRootStore();
  const { showConfirmation } = useDeleteConfirmation();
  const options = useOperatorChipOptions();
  const [detail, setDetail] = useState<OperatorUserDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [delta, setDelta] = useState("");

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!user) return;

    setDetail(null);
    setDelta("");

    let cancelled = false;
    setIsLoading(true);
    getOperatorUserDetailAction({ userId: user.id })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setDetail(res.data);
        else toastZodErrorTree(res.error);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });

    return () => {
      cancelled = true;
    };
  }, [user, userId]);

  if (!user) return null;

  const person = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const workspace = user.workspaceOwnerEmail
    ? t("OperatorWorkspaces.modal.identity", {
        domain: user.workspaceLabel,
        owner: user.workspaceOwnerEmail,
      })
    : user.workspaceLabel;
  const identity = t("OperatorUsers.modal.identity", { person, email: user.email });
  const period = detail?.creditPeriod ?? null;
  const allowanceMissing = period?.blockedReason === "enterprise_allowance_missing";

  const reload = () => {
    if (!user) return;
    setIsLoading(true);
    getOperatorUserDetailAction({ userId: user.id })
      .then((res) => {
        if (res.ok) setDetail(res.data);
        else toastZodErrorTree(res.error);
      })
      .finally(() => setIsLoading(false))
      .catch(() => setDetail(null));
  };

  const applyCorrection = () => {
    const creditDelta = Number(delta);
    if (!period || !Number.isInteger(creditDelta) || creditDelta === 0) return;

    showConfirmation({
      title: t("OperatorConsole.confirm.title"),
      message: t("OperatorUsers.modal.adjustmentConfirm", {
        name: identity,
        value: intlStore.formatNumber(creditDelta),
      }),
      confirmLabel: t("Common.actions.confirm"),
      confirmVariant: "default",
      successKey: "Common.notifications.updated",
      onConfirm: async () => {
        const committed = await operatorUsersStore.applyCreditCorrection({
          companyId: user.companyId,
          userId: user.id,
          creditDelta,
          periodStart: period.periodStart.toISOString(),
          periodEnd: period.periodEnd.toISOString(),
          operationId: globalThis.crypto.randomUUID(),
        });
        if (committed) {
          setDelta("");
          reload();
        }
        return committed;
      },
    });
  };

  const confirmReset = (mode: "baseAllowance" | "zeroBalance", label: string) => {
    if (!period) return;

    showConfirmation({
      title: t("OperatorUsers.reset.title"),
      message: t("OperatorUsers.confirm.reset", { name: identity, value: label }),
      confirmLabel: t("Common.actions.confirm"),
      confirmVariant: "default",
      successKey: "Common.notifications.updated",
      onConfirm: async () => {
        const committed = await operatorUsersStore.resetCredits({
          userId: user.id,
          mode,
          operationId: globalThis.crypto.randomUUID(),
        });
        if (committed) reload();
        return committed;
      },
    });
  };

  return (
    <AppModal open={user !== null} size="3xl" title={identity} onClose={onClose}>
      <AppCard>
        <AppCardHeader>
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="grow truncate text-x-lg">{person}</h2>

            {user.isPlatformOperator ? (
              <AppChip size="sm" variant="secondary">
                {t("OperatorUsers.values.operator")}
              </AppChip>
            ) : null}
          </div>
        </AppCardHeader>

        <AppCardBody>
          <div className="flex flex-col gap-1.5">
            <InfoRow label={t("Common.table.columns.email")}>{user.email}</InfoRow>

            <InfoRow label={t("Common.table.columns.workspace")}>{workspace}</InfoRow>

            <InfoRow label={t("Common.table.columns.lastActiveAt")}>
              {user.lastActiveAt ? intlStore.formatNumericalShortDateTime(user.lastActiveAt) : "-"}
            </InfoRow>

            <InfoRow label={t("Common.table.columns.createdAt")}>
              {intlStore.formatNumericalShortDateTime(user.createdAt)}
            </InfoRow>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <h3 className="text-x-sm font-medium">{t("OperatorUsers.modal.access")}</h3>

            <div className="flex flex-col gap-1.5">
              <InfoRow label={t("Common.table.columns.status")}>
                <OperatorChipSelect
                  confirmMessage={(option) =>
                    t("OperatorUsers.confirm.status", { name: identity, value: option.label })
                  }
                  confirmTitle={t("OperatorConsole.confirm.title")}
                  emptyLabel="-"
                  options={options.accountStatus}
                  value={user.status}
                  onCommit={(value) => operatorUsersStore.updateStatus({ userId: user.id, status: value as Status })}
                />
              </InfoRow>

              <InfoRow label={t("Common.table.columns.operator")}>
                <OperatorChipSelect
                  confirmMessage={(option) =>
                    t("OperatorUsers.confirm.operator", { name: identity, value: option.label })
                  }
                  confirmTitle={t("OperatorConsole.confirm.title")}
                  emptyLabel="-"
                  options={options.platformAccess}
                  value={String(user.isPlatformOperator)}
                  onCommit={(value) =>
                    operatorUsersStore.updatePlatformAccess({
                      userId: user.id,
                      isPlatformOperator: value === PLATFORM_ACCESS_GRANTED,
                    })
                  }
                />
              </InfoRow>
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <h3 className="text-x-sm font-medium">{t("OperatorUsers.credits.title")}</h3>

            {isLoading ? <Skeleton className="h-28 w-full" /> : null}

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
                        onClose();
                        router.push(`/operator/workspaces?searchTerm=${encodeURIComponent(user.email)}`);
                      }}
                    >
                      {t("OperatorUsers.credits.setAllowance")}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1.5">
                        <FormLabel htmlFor="operator-modal-delta">{t("OperatorUsers.adjustment.deltaLabel")}</FormLabel>

                        <Input
                          id="operator-modal-delta"
                          inputMode="numeric"
                          placeholder={t("OperatorUsers.adjustment.deltaPlaceholder")}
                          type="number"
                          value={delta}
                          onChange={(event) => setDelta(event.target.value)}
                        />
                      </div>

                      <Button disabled={!delta} size="sm" variant="secondary" onClick={applyCorrection}>
                        {t("Common.actions.save")}
                      </Button>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {t("OperatorUsers.adjustment.expiresAt", {
                        date: intlStore.formatNumericalShortDate(period.periodEnd),
                      })}
                    </p>

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

            {!isLoading && detail && !period ? (
              <p className="text-xs text-muted-foreground">{t("OperatorUsers.credits.unavailableDescription")}</p>
            ) : null}
          </div>
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
});
