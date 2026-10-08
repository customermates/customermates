"use client";

import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";
import type { OperatorWorkspaceStatsDto } from "@/ee/operator/operator.schema";
import type { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import { SubscriptionPlan as SubscriptionPlanEnum } from "@/generated/prisma";

import { AppModal } from "@/components/modal";
import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppChip } from "@/components/chip/app-chip";
import { ClickableChip } from "@/components/chip/clickable-chip";
import { InfoRow } from "@/components/shared/info-row";
import { FormInputChips } from "@/components/forms/form-input-chips";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { FormLabel } from "@/components/forms/form-label";
import { FormNumberInput } from "@/components/forms/form-number-input";
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
import { getOperatorWorkspaceTagsAction } from "../../actions";

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
  const [allowance, setAllowance] = useState<number | undefined>(undefined);
  const [trialEnd, setTrialEnd] = useState("");
  const [billingId, setBillingId] = useState("");
  const [channelMonth, setChannelMonth] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [reason, setReason] = useState("");

  const companyId = workspace?.id ?? null;

  function formatChannelMonth(month: string) {
    const parsed = new Date(`${month}-01T00:00:00`);
    return Number.isFinite(parsed.getTime()) ? intlStore.formatMonthYear(parsed) : month;
  }

  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    setStats(null);
    setChannelMonth("");
    setAllowance(workspace.enterpriseCreditsPerUser ?? undefined);
    setTrialEnd(toDateInput(workspace.trialEndDate));
    setBillingId(workspace.lemonSqueezyId ?? "");
    setTags(workspace.tags);
    setDeleting(false);
    setReason("");

    let cancelled = false;

    void getOperatorWorkspaceTagsAction()
      .then((available) => {
        if (!cancelled) setKnownTags(available);
      })
      .catch(() => {
        if (!cancelled) setKnownTags([]);
      });

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
  }, [companyId]);

  if (!workspace) return null;

  const identity = workspace.ownerEmail
    ? t("OperatorWorkspaces.modal.identity", { domain: workspace.workspaceLabel, owner: workspace.ownerEmail })
    : workspace.workspaceLabel;
  const isEnterprise = workspace.plan === SubscriptionPlanEnum.enterprise;
  const clearingBinding = Boolean(workspace.lemonSqueezyId) && billingId.trim().length === 0;
  const selectedChannelMonth = stats?.channelMonths.find((entry) => entry.month === channelMonth) ?? null;
  const tagsDirty = tags.join("\u0000") !== workspace.tags.join("\u0000");
  const termsDirty = trialEnd !== toDateInput(workspace.trialEndDate) || billingId !== (workspace.lemonSqueezyId ?? "");
  const allowanceDirty = isEnterprise && allowance !== (workspace.enterpriseCreditsPerUser ?? undefined);
  const tagSuggestions = knownTags.filter(
    (tag) => !tags.some((applied) => applied.toLowerCase() === tag.toLowerCase()),
  );

  const save = () => {
    const creditsPerUser = allowance;
    const nextTrialEnd = trialEnd ? new Date(`${trialEnd}T23:59:59.999`) : null;
    const trimmedId = billingId.trim();
    const allowanceValid = creditsPerUser !== undefined && Number.isInteger(creditsPerUser) && creditsPerUser >= 1;
    if ((allowanceDirty && !allowanceValid) || (nextTrialEnd && !Number.isFinite(nextTrialEnd.getTime()))) return;

    const details = [
      ...(tagsDirty
        ? [
            tags.length > 0
              ? t("OperatorConsole.confirm.tags", { name: identity, value: tags.join(", ") })
              : t("OperatorConsole.confirm.tagsCleared", { name: identity }),
          ]
        : []),
      ...(termsDirty
        ? [
            clearingBinding
              ? t("OperatorConsole.confirm.termsClearingBilling", { name: identity })
              : t("OperatorConsole.confirm.terms", { name: identity }),
          ]
        : []),
      ...(allowanceDirty && creditsPerUser !== undefined
        ? [
            t("OperatorConsole.confirm.allowance", {
              name: identity,
              value: intlStore.formatNumber(creditsPerUser),
            }),
          ]
        : []),
    ];

    showConfirmation({
      title: t("OperatorConsole.confirm.title"),
      message: details.length === 1 ? details[0] : t("OperatorConsole.confirm.changes", { name: identity }),
      details: details.length === 1 ? undefined : details,
      confirmLabel: t("Common.actions.confirm"),
      confirmVariant: termsDirty && clearingBinding ? "destructive" : "default",
      successKey: "Common.notifications.updated",
      onConfirm: async () => {
        if (tagsDirty && !(await operatorWorkspacesStore.updateTags({ companyId: workspace.id, tags }))) return false;
        if (
          termsDirty &&
          !(await operatorWorkspacesStore.updateSubscriptionTerms({
            companyId: workspace.id,
            trialEndDate: nextTrialEnd ? nextTrialEnd.toISOString() : null,
            lemonSqueezyId: trimmedId.length > 0 ? trimmedId : null,
          }))
        )
          return false;
        if (allowanceDirty && creditsPerUser !== undefined)
          return operatorWorkspacesStore.updateEnterpriseAllowance({ companyId: workspace.id, creditsPerUser });
        return true;
      },
    });
  };

  const deleteWorkspace = async () => {
    const committed = await operatorWorkspacesStore.deleteWorkspace({
      companyId: workspace.id,
      confirmWorkspaceLabel: workspace.workspaceLabel,
      reason: reason.trim(),
    });
    if (!committed) return;
    setDeleting(false);
    onClose();
  };

  return (
    <AppModal
      actions={[
        {
          id: "delete-workspace",
          anchorId: "operator-modal-delete",
          label: t("OperatorWorkspaces.delete.action"),
          icon: Trash2,
          variant: "destructive",
          onClick: () => {
            setReason("");
            setDeleting(true);
          },
        },
      ]}
      open={workspace !== null}
      size="3xl"
      title={identity}
      onClose={onClose}
    >
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
            <div className="space-y-1">
              <h3 className="text-x-sm font-medium">{t("OperatorWorkspaces.tags.title")}</h3>

              <p className="text-xs text-muted-foreground">{t("OperatorWorkspaces.tags.description")}</p>
            </div>

            <div className="flex items-end gap-2">
              <FormInputChips
                arrayMode
                containerClassName="flex-1"
                id="operator-modal-tags"
                label={t("OperatorWorkspaces.tags.label")}
                placeholder={t("OperatorWorkspaces.tags.placeholder")}
                value={tags}
                onValueChange={setTags}
              />
            </div>

            {tagSuggestions.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-xs text-muted-foreground">{t("OperatorWorkspaces.tags.suggestions")}</span>

                {tagSuggestions.map((tag) => (
                  <ClickableChip key={tag} size="sm" variant="outline" onClick={() => setTags([...tags, tag])}>
                    {tag}
                  </ClickableChip>
                ))}
              </div>
            ) : null}
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
              <div className="flex-1">
                <FormIsoDatePicker
                  clearable={false}
                  containerClassName="flex-1"
                  id="operator-modal-trial"
                  label={t("OperatorWorkspaces.terms.trialEnd")}
                  value={trialEnd}
                  onValueChange={(value) => setTrialEnd(value ?? "")}
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
            </div>

            {clearingBinding ? (
              <p className="text-xs text-muted-foreground">{t("OperatorWorkspaces.terms.billingWarning")}</p>
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
                  <FormNumberInput
                    containerClassName="flex-1"
                    id="operator-modal-allowance"
                    label={t("OperatorWorkspaces.allowance.label")}
                    min={1}
                    value={allowance}
                    onValueChange={setAllowance}
                  />
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
                          month: formatChannelMonth(entry.month),
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
        </AppCardBody>

        <FormFooterActions
          anchorScope="operator-modal"
          dirty={tagsDirty || termsDirty || allowanceDirty}
          onSave={save}
        />
      </AppCard>

      <ConfirmDialog
        confirmDisabled={reason.trim().length === 0}
        confirmLabel={t("Common.actions.delete")}
        confirmationText={workspace.workspaceLabel}
        description={t("OperatorWorkspaces.delete.warningDescription", {
          name: identity,
          members: workspace.userCount,
        })}
        open={deleting}
        title={t("OperatorWorkspaces.delete.confirmTitle")}
        onCancel={() => setDeleting(false)}
        onConfirm={deleteWorkspace}
      >
        <div className="space-y-1.5">
          <FormLabel htmlFor="operator-modal-reason">{t("OperatorWorkspaces.delete.reasonLabel")}</FormLabel>

          <Input
            autoComplete="off"
            id="operator-modal-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </ConfirmDialog>
    </AppModal>
  );
});
