"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Info, Loader2, Plug, RefreshCw, Trash2 } from "lucide-react";
import { Action, Resource } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { AvatarStack } from "@/components/shared/avatar-stack";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AppModal, type AppModalActionProps, type AppModalActions } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { InfoRow } from "@/components/shared/info-row";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { getEffectiveEntitlements } from "@/ee/subscription/entitlements";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";

import { accountStatusChipColor, getProviderDisplayLabel } from "./account-status-color";
import { isEmailProvider } from "@/ee/messaging/provider";

import { AccountFolders } from "./account-folders";
import { AccountSignature } from "./account-signature";

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

  const showSignatureTab = isEmailProvider(account.provider) && account.isOwner;
  const showFoldersTab = account.folders.length > 0;
  const tabCount = 1 + (showSignatureTab ? 1 : 0) + (showFoldersTab ? 1 : 0);

  const title = account.displayName ?? getProviderDisplayLabel(account, t);
  const statusLabel = t(`ConnectedAccountsCard.statusLabels.${account.status}`);
  const ProviderIcon = getProviderIcon(account.provider);
  const providerLabel = getProviderDisplayLabel(account, t);
  const shownFolders = account.folders.filter((folder) => account.selectedFolderIds.includes(folder.id)).length;
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
          label: t("ConnectedAccountsCard.reactivate"),
          icon: Plug,
          onClick: () => connectedAccountsStore.reconnect(account.id),
        }
      : canResync
        ? {
            id: "resync-account",
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
    <AppModal actions={modalActions} store={connectedAccountModalStore} title={title}>
      <AppCard>
        <AppCardHeader>
          <div className="flex min-w-0 items-center gap-2">
            <ProviderIcon className="size-4 shrink-0" />

            <h2 className="text-x-lg truncate">{title}</h2>
          </div>
        </AppCardHeader>

        <AppCardBody>
          <Tabs className="min-w-0" defaultValue="details">
            <TabsList
              aria-label={t("ConnectedAccountsCard.tabs.label")}
              className={cn(
                "grid w-full",
                tabCount === 3 ? "grid-cols-3" : tabCount === 2 ? "grid-cols-2" : "grid-cols-1",
              )}
              variant="segmented"
            >
              <TabsTrigger id="connected-account-tab-details" value="details">
                {t("ConnectedAccountsCard.tabs.details")}
              </TabsTrigger>

              {showSignatureTab && (
                <TabsTrigger id="connected-account-tab-signature" value="signature">
                  {t("ConnectedAccountsCard.tabs.signature")}
                </TabsTrigger>
              )}

              {showFoldersTab && (
                <TabsTrigger id="connected-account-tab-folders" value="folders">
                  {t("ConnectedAccountsCard.tabs.folders")}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent className="pt-5" value="details">
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
            </TabsContent>

            {showSignatureTab && (
              <TabsContent className="pt-5" value="signature">
                <AccountSignature
                  disabled={!canUpdate}
                  value={account.signature ?? ""}
                  onSave={(next) => runUserAction(() => connectedAccountModalStore.saveSignature(next))}
                />
              </TabsContent>
            )}

            {showFoldersTab && (
              <TabsContent className="pt-5" value="folders">
                <AccountFolders
                  account={account}
                  editable={account.isOwner && canUpdate}
                  onToggle={(folderId, on) =>
                    runUserAction(() => connectedAccountModalStore.toggleFolder(folderId, on))
                  }
                />
              </TabsContent>
            )}
          </Tabs>
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
});
