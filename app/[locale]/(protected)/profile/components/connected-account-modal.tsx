"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Loader2, Plug, RefreshCw, Trash2 } from "lucide-react";
import { Action, Resource } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { AvatarStack } from "@/components/shared/avatar-stack";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { Icon } from "@/components/shared/icon";
import { InfoRow } from "@/components/shared/info-row";
import { getProviderIcon } from "@/ee/messaging/provider-icon";

import { accountStatusChipColor, getProviderDisplayLabel } from "./account-status-color";
import { AccountFolders } from "./account-folders";

export const ConnectedAccountModal = observer(() => {
  const t = useTranslations();
  const { connectedAccountModalStore, connectedAccountsStore, intlStore, userModalStore, userStore } = useRootStore();
  const { form: account, close } = connectedAccountModalStore;
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const canUpdate = userStore.can(Resource.inboxMessages, Action.update);
  const canDelete = userStore.can(Resource.inboxMessages, Action.delete);

  const title = account.displayName ?? getProviderDisplayLabel(account, t);
  const statusLabel = t(`ConnectedAccountsCard.statusLabels.${account.status}`);
  const ProviderIcon = getProviderIcon(account.provider);
  const providerLabel = getProviderDisplayLabel(account, t);
  const shownFolders = account.folders.filter((folder) => account.selectedFolderIds.includes(folder.id)).length;

  return (
    <AppModal store={connectedAccountModalStore} title={title}>
      <AppCard>
        <AppCardHeader>
          <div className="mr-auto flex min-w-0 items-center gap-2">
            <ProviderIcon className="size-4 shrink-0" />

            <h2 className="text-x-lg truncate">{title}</h2>
          </div>

          {account.isOwner && (
            <div className="flex items-center gap-2">
              {canUpdate &&
                (account.status === "credentials" ||
                  account.status === "permissions" ||
                  account.status === "error" ||
                  account.status === "stopped") && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="secondary"
                        onClick={() => void connectedAccountsStore.reconnect(account.id)}
                      >
                        <Icon icon={Plug} />
                      </Button>
                    </TooltipTrigger>

                    <TooltipContent>{t("ConnectedAccountsCard.reactivate")}</TooltipContent>
                  </Tooltip>
                )}

              {canUpdate && (account.status === "ok" || account.status === "connecting") && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="secondary"
                      onClick={() => void connectedAccountsStore.resync(account.id)}
                    >
                      <Icon icon={RefreshCw} />
                    </Button>
                  </TooltipTrigger>

                  <TooltipContent>{t("ConnectedAccountsCard.resync")}</TooltipContent>
                </Tooltip>
              )}

              {canDelete && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="destructive"
                      onClick={() =>
                        showDeleteConfirmation(async () => {
                          await connectedAccountsStore.disconnect(account.id);
                          close();
                        }, title)
                      }
                    >
                      <Icon icon={Trash2} />
                    </Button>
                  </TooltipTrigger>

                  <TooltipContent>{t("ConnectedAccountsCard.disconnect")}</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </AppCardHeader>

        <AppCardBody>
          <div className="flex flex-col gap-2">
            <InfoRow label={t("ConnectedAccountsCard.provider")}>{providerLabel}</InfoRow>

            <InfoRow label={t("ConnectedAccountsCard.status")}>
              {account.syncing ? (
                <AppChip startContent={<Loader2 className="animate-spin" />} variant="info">
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

                  <Switch
                    checked={account.shared}
                    disabled={!canUpdate}
                    id="connected-account-visibility"
                    onCheckedChange={(next) => void connectedAccountModalStore.toggleVisibility(next)}
                  />
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
                onAvatarClick={(user) => void userModalStore.loadById(user.id)}
              />
            </InfoRow>

            {account.folders.length > 0 && (
              <InfoRow label={t("ConnectedAccountsCard.folders")}>
                {t("ConnectedAccountsCard.foldersShown", { shown: shownFolders, total: account.folders.length })}
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

          {account.folders.length > 0 && (
            <AccountFolders
              account={account}
              editable={account.isOwner && canUpdate}
              onToggle={(folderId, on) => void connectedAccountModalStore.toggleFolder(folderId, on)}
            />
          )}
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
});
