"use client";

import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";
import type { OperatorWorkspaceStatsDto } from "@/ee/operator/operator.schema";
import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { SubscriptionPlan as SubscriptionPlanEnum } from "@/generated/prisma";

import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppChip } from "@/components/chip/app-chip";
import { InfoRow } from "@/components/shared/info-row";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/forms/form-label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { OperatorChipSelect } from "../operator-chip-select";
import { useOperatorChipOptions } from "../use-operator-chip-options";
import { getOperatorWorkspaceStatsAction } from "../../workspaces/actions";

type Props = { workspace: OperatorWorkspaceRowDto | null; onClose: () => void };

function toDateInput(value: Date | null): string {
  if (!value) return "";
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const OperatorWorkspaceModal = observer(function OperatorWorkspaceModal({ workspace, onClose }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { operatorWorkspacesStore } = useRootStore();
  const { showConfirmation } = useDeleteConfirmation();
  const options = useOperatorChipOptions();
  const [stats, setStats] = useState<OperatorWorkspaceStatsDto | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [allowance, setAllowance] = useState("");
  const [trialEnd, setTrialEnd] = useState("");
  const [billingId, setBillingId] = useState("");
  const [channelMonth, setChannelMonth] = useState("");
  const [confirmLabel, setConfirmLabel] = useState("");
  const [reason, setReason] = useState("");

  const companyId = workspace?.id ?? null;

  useEffect(() => {
    if (!workspace) return;

    setStats(null);
    setChannelMonth("");
    setAllowance(workspace.enterpriseCreditsPerUser === null ? "" : String(workspace.enterpriseCreditsPerUser));
    setTrialEnd(toDateInput(workspace.trialEndDate));
    setBillingId(workspace.lemonSqueezyId ?? "");
    setConfirmLabel("");
    setReason("");

    let cancelled = false;
    setIsLoadingStats(true);
    void getOperatorWorkspaceStatsAction({ companyId: workspace.id })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setStats(res.data);
          setChannelMonth(res.data.channelMonths[0]?.month ?? "");
        } else toastZodErrorTree(res.error);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingStats(false);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });

    return () => {
      cancelled = true;
    };
  }, [workspace, companyId]);

  if (!workspace) return null;

  const identity = workspace.ownerEmail
    ? t("OperatorWorkspaces.modal.identity", { domain: workspace.workspaceLabel, owner: workspace.ownerEmail })
    : workspace.workspaceLabel;
  const isEnterprise = workspace.plan === SubscriptionPlanEnum.enterprise;
  const canDelete = confirmLabel === workspace.workspaceLabel && reason.trim().length > 0;
  const clearingBinding = Boolean(workspace.lemonSqueezyId) && billingId.trim().length === 0;
  const selectedChannelMonth = stats?.channelMonths.find((entry) => entry.month === channelMonth) ?? null;

  const saveAllowance = () => {
    const creditsPerUser = Number(allowance);
    if (!Number.isInteger(creditsPerUser) || creditsPerUser < 1) return;

    showConfirmation({
      title: t("OperatorConsole.confirm.title"),
      message: t("OperatorConsole.confirm.allowance", {
        name: identity,
        value: intlStore.formatNumber(creditsPerUser),
      }),
      confirmLabel: t("Common.actions.confirm"),
      confirmVariant: "default",
      successKey: "Common.notifications.updated",
      onConfirm: () => operatorWorkspacesStore.updateEnterpriseAllowance({ companyId: workspace.id, creditsPerUser }),
    });
  };

  const saveTerms = () => {
    const trimmedId = billingId.trim();
    const nextTrialEnd = trialEnd ? new Date(`${trialEnd}T23:59:59.999`) : null;
    if (nextTrialEnd && !Number.isFinite(nextTrialEnd.getTime())) return;

    showConfirmation({
      title: t("OperatorConsole.confirm.title"),
      message: clearingBinding
        ? t("OperatorConsole.confirm.termsClearingBilling", { name: identity })
        : t("OperatorConsole.confirm.terms", { name: identity }),
      confirmLabel: t("Common.actions.confirm"),
      confirmVariant: clearingBinding ? "destructive" : "default",
      successKey: "Common.notifications.updated",
      onConfirm: () =>
        operatorWorkspacesStore.updateSubscriptionTerms({
          companyId: workspace.id,
          trialEndDate: nextTrialEnd ? nextTrialEnd.toISOString() : null,
          lemonSqueezyId: trimmedId.length > 0 ? trimmedId : null,
        }),
    });
  };

  const confirmDelete = () => {
    if (!canDelete) return;

    showConfirmation({
      title: t("OperatorWorkspaces.delete.confirmTitle"),
      message: t("OperatorWorkspaces.delete.confirmMessage", { name: identity, members: workspace.userCount }),
      confirmLabel: t("Common.actions.delete"),
      confirmVariant: "destructive",
      successKey: "Common.notifications.deleted",
      onConfirm: async () => {
        const committed = await operatorWorkspacesStore.deleteWorkspace({
          companyId: workspace.id,
          confirmWorkspaceLabel: confirmLabel,
          reason: reason.trim(),
        });
        if (committed) onClose();
        return committed;
      },
    });
  };

  return (
    <AppModal open={workspace !== null} size="3xl" title={identity} onClose={onClose}>
      <AppCard>
        <AppCardHeader>
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="grow truncate text-x-lg">{workspace.workspaceLabel}</h2>

            {workspace.plan ? (
              <AppChip size="sm" variant="secondary">
                {t(`Subscription.planNames.${workspace.plan}`)}
              </AppChip>
            ) : null}
          </div>
        </AppCardHeader>

        <AppCardBody>
          <div className="flex flex-col gap-1.5">
            <InfoRow label={t("Common.table.columns.owner")}>{workspace.ownerEmail ?? "-"}</InfoRow>

            <InfoRow label={t("Common.table.columns.members")}>
              {t("OperatorWorkspaces.values.members", {
                active: workspace.activeUserCount,
                total: workspace.userCount,
              })}
            </InfoRow>

            <InfoRow label={t("Common.table.columns.createdAt")}>
              {intlStore.formatNumericalShortDateTime(workspace.createdAt)}
            </InfoRow>

            <InfoRow label={t("OperatorWorkspaces.modal.workspaceId")}>{workspace.id}</InfoRow>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <h3 className="text-x-sm font-medium">{t("OperatorWorkspaces.modal.subscription")}</h3>

            <div className="flex flex-col gap-1.5">
              <InfoRow label={t("Common.table.columns.plan")}>
                <OperatorChipSelect
                  confirmMessage={(option) =>
                    t("OperatorConsole.confirm.plan", { name: identity, value: option.label })
                  }
                  confirmTitle={t("OperatorConsole.confirm.title")}
                  emptyLabel={t("OperatorUsers.values.noSubscription")}
                  options={options.plan}
                  readOnly={!workspace.ownerUserId || !workspace.subscriptionUpdatedAt}
                  value={workspace.plan}
                  onCommit={(value) =>
                    operatorWorkspacesStore.correctSubscription({
                      userId: workspace.ownerUserId ?? "",
                      plan: value as SubscriptionPlan,
                      status: workspace.subscriptionStatus as SubscriptionStatus,
                      quantity: workspace.seats,
                    })
                  }
                />
              </InfoRow>

              <InfoRow label={t("Common.table.columns.subscription")}>
                <OperatorChipSelect
                  confirmMessage={(option) =>
                    t("OperatorConsole.confirm.subscription", { name: identity, value: option.label })
                  }
                  confirmTitle={t("OperatorConsole.confirm.title")}
                  emptyLabel={t("OperatorUsers.values.noSubscription")}
                  options={options.subscription}
                  readOnly={!workspace.ownerUserId || !workspace.subscriptionUpdatedAt}
                  value={workspace.subscriptionStatus}
                  onCommit={(value) =>
                    operatorWorkspacesStore.correctSubscription({
                      userId: workspace.ownerUserId ?? "",
                      plan: workspace.plan as SubscriptionPlan,
                      status: value as SubscriptionStatus,
                      quantity: workspace.seats,
                    })
                  }
                />
              </InfoRow>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <FormLabel htmlFor="operator-modal-trial">{t("OperatorWorkspaces.terms.trialEnd")}</FormLabel>

                <Input
                  id="operator-modal-trial"
                  type="date"
                  value={trialEnd}
                  onChange={(event) => setTrialEnd(event.target.value)}
                />
              </div>

              <div className="flex-1 space-y-1.5">
                <FormLabel htmlFor="operator-modal-billing">{t("OperatorWorkspaces.terms.billingId")}</FormLabel>

                <Input
                  autoComplete="off"
                  id="operator-modal-billing"
                  placeholder={t("OperatorWorkspaces.terms.billingIdPlaceholder")}
                  value={billingId}
                  onChange={(event) => setBillingId(event.target.value)}
                />
              </div>

              <Button size="sm" variant="secondary" onClick={saveTerms}>
                {t("Common.actions.save")}
              </Button>
            </div>

            {clearingBinding ? (
              <p className="text-xs text-destructive">{t("OperatorWorkspaces.terms.billingWarning")}</p>
            ) : null}
          </div>

          {isEnterprise ? (
            <>
              <Separator />

              <div className="flex flex-col gap-3">
                <div className="space-y-1">
                  <h3 className="text-x-sm font-medium">{t("OperatorWorkspaces.allowance.title")}</h3>

                  <p className="text-xs text-muted-foreground">
                    {t("OperatorWorkspaces.allowance.warningDescription")}
                  </p>
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <FormLabel htmlFor="operator-modal-allowance">{t("OperatorWorkspaces.allowance.label")}</FormLabel>

                    <Input
                      id="operator-modal-allowance"
                      inputMode="numeric"
                      min={1}
                      type="number"
                      value={allowance}
                      onChange={(event) => setAllowance(event.target.value)}
                    />
                  </div>

                  <Button disabled={!allowance} size="sm" variant="secondary" onClick={saveAllowance}>
                    {t("Common.actions.save")}
                  </Button>
                </div>
              </div>
            </>
          ) : null}

          <Separator />

          <div className="flex flex-col gap-3">
            <h3 className="text-x-sm font-medium">{t("OperatorWorkspaces.stats.title")}</h3>

            {isLoadingStats ? <Skeleton className="h-32 w-full" /> : null}

            {stats ? (
              <div className="flex flex-col gap-1.5">
                <InfoRow label={t("OperatorWorkspaces.stats.contacts")}>
                  {intlStore.formatNumber(stats.contacts)}
                </InfoRow>

                <InfoRow label={t("OperatorWorkspaces.stats.organizations")}>
                  {intlStore.formatNumber(stats.organizations)}
                </InfoRow>

                <InfoRow label={t("OperatorWorkspaces.stats.deals")}>{intlStore.formatNumber(stats.deals)}</InfoRow>

                <InfoRow label={t("OperatorWorkspaces.stats.services")}>
                  {intlStore.formatNumber(stats.services)}
                </InfoRow>

                <InfoRow label={t("OperatorWorkspaces.stats.tasks")}>{intlStore.formatNumber(stats.tasks)}</InfoRow>

                <InfoRow label={t("OperatorWorkspaces.stats.threads")}>
                  {intlStore.formatNumber(stats.messagingThreads)}
                </InfoRow>

                <InfoRow label={t("OperatorWorkspaces.stats.messages")}>
                  {intlStore.formatNumber(stats.messagingMessages)}
                </InfoRow>

                <InfoRow label={t("OperatorWorkspaces.stats.assistantConversations")}>
                  {intlStore.formatNumber(stats.agentConversations)}
                </InfoRow>

                <InfoRow label={t("OperatorWorkspaces.stats.connectedAccounts")}>
                  {intlStore.formatNumber(stats.connectedAccounts)}
                </InfoRow>

                <InfoRow label={t("OperatorWorkspaces.stats.lastActive")}>
                  {stats.lastActiveAt
                    ? intlStore.formatNumericalShortDateTime(stats.lastActiveAt)
                    : t("OperatorWorkspaces.stats.never")}
                </InfoRow>

                <InfoRow label={t("OperatorWorkspaces.stats.lastActivity")}>
                  {stats.lastActivityAt
                    ? intlStore.formatNumericalShortDateTime(stats.lastActivityAt)
                    : t("OperatorWorkspaces.stats.never")}
                </InfoRow>
              </div>
            ) : null}
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <div className="space-y-1">
              <h3 className="text-x-sm font-medium">{t("OperatorWorkspaces.channels.title")}</h3>

              <p className="text-xs text-muted-foreground">{t("OperatorWorkspaces.channels.description")}</p>
            </div>

            {isLoadingStats ? <Skeleton className="h-24 w-full" /> : null}

            {stats && stats.channelMonths.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("OperatorWorkspaces.channels.none")}</p>
            ) : null}

            {stats && stats.channelMonths.length > 0 ? (
              <>
                <Select value={channelMonth} onValueChange={setChannelMonth}>
                  <SelectTrigger aria-label={t("OperatorWorkspaces.channels.monthLabel")} id="operator-channel-month">
                    <SelectValue placeholder={t("OperatorWorkspaces.channels.monthLabel")} />
                  </SelectTrigger>

                  <SelectContent>
                    {stats.channelMonths.map((entry) => (
                      <SelectItem key={entry.month} textValue={entry.month} value={entry.month}>
                        {t("OperatorWorkspaces.channels.monthOption", {
                          month: entry.month,
                          count: entry.peakConcurrent,
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedChannelMonth ? (
                  <div className="flex flex-col gap-1.5 rounded-md bg-foreground/5 p-3">
                    <div className="flex flex-col gap-1">
                      {selectedChannelMonth.channels.map((channel) => (
                        <span
                          key={`${channel.provider}-${channel.identifier}`}
                          className="text-xs text-muted-foreground"
                        >
                          {`${t(`Common.providers.${channel.provider}`)} \u00b7 ${channel.identifier}`}
                        </span>
                      ))}
                    </div>

                    {selectedChannelMonth.approximate ? (
                      <span className="text-xs text-muted-foreground">
                        {t("OperatorWorkspaces.channels.approximate")}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <div className="space-y-1">
              <h3 className="text-x-sm font-medium text-destructive">{t("OperatorWorkspaces.delete.title")}</h3>

              <p className="text-xs text-muted-foreground">
                {t("OperatorWorkspaces.delete.warningDescription", {
                  name: identity,
                  members: workspace.userCount,
                })}
              </p>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <FormLabel htmlFor="operator-modal-confirm">
                  {t("OperatorWorkspaces.delete.confirmLabel", { name: workspace.workspaceLabel })}
                </FormLabel>

                <Input
                  autoComplete="off"
                  id="operator-modal-confirm"
                  value={confirmLabel}
                  onChange={(event) => setConfirmLabel(event.target.value)}
                />
              </div>

              <div className="flex-1 space-y-1.5">
                <FormLabel htmlFor="operator-modal-reason">{t("OperatorWorkspaces.delete.reasonLabel")}</FormLabel>

                <Input
                  autoComplete="off"
                  id="operator-modal-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
            </div>

            <Button className="w-full" disabled={!canDelete} size="sm" variant="destructive" onClick={confirmDelete}>
              {t("OperatorWorkspaces.delete.action")}
            </Button>
          </div>
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
});
