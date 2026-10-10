"use client";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Info, Loader2, Plug, RefreshCw, Trash2 } from "lucide-react";
import { Action, Resource } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { AvatarStack } from "@/components/shared/avatar-stack";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl, SegmentedControlPanel } from "@/components/ui/segmented-control";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AppModal, type AppModalActionProps, type AppModalActions } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { InfoRow } from "@/components/shared/info-row";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { getEffectiveEntitlements } from "@/ee/subscription/entitlements";
import { runUserAction } from "@/core/errors/report-application-error";

import { accountStatusChipColor, getProviderDisplayLabel } from "./account-status-color";
import { isEmailProvider } from "@/ee/messaging/provider";

import { AccountFolders } from "./account-folders";
import { ACCOUNT_EMAIL_FORM_ID, AccountSignature } from "./account-signature";

export const ConnectedAccountModal = observer(() => {
  const t = useTranslations();
  const rootStore = useRootStore();
  const { connectedAccountModalStore, connectedAccountsStore, userModalStore, userStore, subscriptionStore } =
    rootStore;
  const intlStore = useHydratedIntlStore();
  const { form: account, close } = connectedAccountModalStore;
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const canUpdate = userStore.can(Resource.inboxMessages, Action.update);
  const canDelete = userStore.can(Resource.inboxMessages, Action.delete);
  const [tabState, setTabState] = useState({
    accountId: account.id,
    tab: "details",
  });

  const showEmailTab = isEmailProvider(account.provider) && account.isOwner;
  const showFoldersTab = account.folders.length > 0;
  const requestedTab = tabState.accountId === account.id ? tabState.tab : "details";
  const activeTab =
    (requestedTab === "email" && !showEmailTab) || (requestedTab === "folders" && !showFoldersTab)
      ? "details"
      : requestedTab;

  const title = account.displayName ?? getProviderDisplayLabel(account, t);
  const statusLabel = t(`ConnectedAccountsCard.statusLabels.${account.status}`);
  const ProviderIcon = getProviderIcon(account.provider);
  const providerLabel = getProviderDisplayLabel(account, t);
  const shownFolders = account.folders.filter((folder) => account.selectedFolderIds.includes(folder.id)).length;
  const foldersLabel = t("ConnectedAccountsCard.tabs.foldersCount", {
    shown: shownFolders,
    total: account.folders.length,
  });
  const canReconnect =
    canUpdate &&
    (account.status === "credentials" ||
      account.status === "permissions" ||
      account.status === "error" ||
      account.status === "stopped");
  const canResync = canUpdate && (account.status === "ok" || account.status === "connecting");
  const hasAccountActions = account.isOwner && (canReconnect || canResync || canDelete);
  const canShareAccounts = getEffectiveEntitlements({
    appMode: rootStore.appMode,
    plan: subscriptionStore.subscription?.plan ?? "pro",
  }).sharedAccounts;
  const primaryAction: AppModalActionProps | null = hasAccountActions
    ? canReconnect
      ? {
          id: "reconnect-account",
          anchorId: "connected-account-reactivate",
          label: t("ConnectedAccountsCard.reactivate"),
          icon: Plug,
          onClick: () => connectedAccountsStore.reconnect(account.id),
        }
      : canResync
        ? {
            id: "resync-account",
            anchorId: "connected-account-resync",
            label: t("ConnectedAccountsCard.resync"),
            icon: RefreshCw,
            onClick: () => connectedAccountsStore.resync(account.id),
          }
        : null
    : null;
  const destructiveAction: AppModalActionProps | null =
    hasAccountActions && canDelete
      ? {
          id: "disconnect-account",
          anchorId: "connected-account-disconnect",
          label: t("ConnectedAccountsCard.disconnect"),
          icon: Trash2,
          variant: "destructive",
          onClick: () =>
            showDeleteConfirmation(async () => {
              const disconnected = await connectedAccountsStore.disconnect(account.id);
              if (disconnected) close();
              return disconnected;
            }, title),
        }
      : null;
  const modalActions: AppModalActions = primaryAction
    ? destructiveAction
      ? [primaryAction, destructiveAction]
      : [primaryAction]
    : destructiveAction
      ? [destructiveAction]
      : [];

  return (
    <AppModal
      actions={modalActions}
      size={showEmailTab && activeTab === "email" ? "5xl" : "xl"}
      store={connectedAccountModalStore}
      title={title}
    >
      <AppCard>
        <AppCardHeader>
          <div className="flex min-w-0 items-center gap-2">
            <ProviderIcon className="size-4 shrink-0" />

            <h2 className="text-x-lg truncate">{title}</h2>
          </div>
        </AppCardHeader>

        <AppCardBody>
          <SegmentedControl
            className="min-w-0 gap-0"
            idPrefix="connected-account"
            items={[
              { value: "details", label: t("ConnectedAccountsCard.tabs.details") },
              ...(showEmailTab ? [{ value: "email", label: t("ConnectedAccountsCard.tabs.email") }] : []),
              ...(showFoldersTab ? [{ value: "folders", label: foldersLabel }] : []),
            ]}
            label={t("ConnectedAccountsCard.tabs.label")}
            value={activeTab}
            onValueChange={(tab) => setTabState({ accountId: account.id, tab })}
          >
            <SegmentedControlPanel className="pt-5" value="details">
              <div className="flex flex-col gap-2">
                <InfoRow label={t("ConnectedAccountsCard.provider")}>{providerLabel}</InfoRow>

                <InfoRow label={t("ConnectedAccountsCard.status")}>
                  {account.syncing ? (
                    <AppChip
                      endContent={<Info />}
                      startContent={<Loader2 className="animate-spin" />}
                      tooltip={t("ConnectedAccountsCard.syncingTooltip")}
                      variant="info"
                    >
                      {t("ConnectedAccountsCard.syncing")}
                    </AppChip>
                  ) : (
                    <AppChip variant={accountStatusChipColor(account.status)}>{statusLabel}</AppChip>
                  )}
                </InfoRow>

                <InfoRow label={t("ConnectedAccountsCard.visibility")}>
                  {account.isOwner ? (
                    <div className="flex items-center gap-2">
                      <Label className="text-subdued text-xs" htmlFor="connected-account-visibility">
                        {account.shared
                          ? t("ConnectedAccountsCard.visibilityShared")
                          : t("ConnectedAccountsCard.visibilityPrivate")}
                      </Label>

                      {canShareAccounts ? (
                        <Switch
                          checked={account.shared}
                          disabled={!canUpdate}
                          id="connected-account-visibility"
                          onCheckedChange={(next) =>
                            runUserAction(() => connectedAccountModalStore.toggleVisibility(next))
                          }
                        />
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Switch disabled checked={false} id="connected-account-visibility" />
                            </span>
                          </TooltipTrigger>

                          <TooltipContent>{t("ConnectedAccountsCard.sharedAccountsRequiresBusiness")}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  ) : (
                    <AppChip variant={account.shared ? "info" : "secondary"}>
                      {account.shared
                        ? t("ConnectedAccountsCard.visibilityShared")
                        : t("ConnectedAccountsCard.visibilityPrivate")}
                    </AppChip>
                  )}
                </InfoRow>

                <InfoRow label={t("ConnectedAccountsCard.ownerLabel")}>
                  <AvatarStack
                    items={[
                      {
                        id: account.owner.userId,
                        firstName: account.owner.firstName,
                        lastName: account.owner.lastName,
                        avatarUrl: account.owner.avatarUrl,
                      },
                    ]}
                    onAvatarClick={(user) => runUserAction(() => userModalStore.loadById(user.id))}
                  />
                </InfoRow>

                {account.folders.length > 0 && (
                  <InfoRow label={t("ConnectedAccountsCard.folders")}>
                    {t("ConnectedAccountsCard.foldersShown", {
                      shown: shownFolders,
                      total: account.folders.length,
                    })}
                  </InfoRow>
                )}

                <InfoRow label={t("ConnectedAccountsCard.connectedAt")}>
                  {intlStore.formatNumericalShortDateTime(account.createdAt)}
                </InfoRow>

                {account.lastSyncedAt && (
                  <InfoRow label={t("ConnectedAccountsCard.lastSynced")}>
                    {intlStore.formatNumericalShortDateTime(account.lastSyncedAt)}
                  </InfoRow>
                )}
              </div>
            </SegmentedControlPanel>

            {showEmailTab && (
              <SegmentedControlPanel forceMount className="pt-5" value="email">
                <AccountSignature
                  key={account.id}
                  account={account}
                  store={connectedAccountModalStore.signatureStore}
                />
              </SegmentedControlPanel>
            )}

            {showFoldersTab && (
              <SegmentedControlPanel className="pt-5" value="folders">
                <AccountFolders
                  account={account}
                  editable={account.isOwner && canUpdate}
                  onToggle={(folderId, on) =>
                    runUserAction(() => connectedAccountModalStore.toggleFolder(folderId, on))
                  }
                />
              </SegmentedControlPanel>
            )}
          </SegmentedControl>
        </AppCardBody>

        {showEmailTab && activeTab === "email" && (
          <FormFooterActions
            anchorScope="connected-account-email"
            formId={ACCOUNT_EMAIL_FORM_ID}
            store={connectedAccountModalStore.signatureStore}
          />
        )}
      </AppCard>
    </AppModal>
  );
});
