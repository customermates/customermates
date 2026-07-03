"use client";

import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Action, Resource } from "@/generated/prisma";

import { Alert } from "@/components/shared/alert";
import { AppChip } from "@/components/chip/app-chip";
import { AvatarStack } from "@/components/shared/avatar-stack";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InfoRow } from "@/components/shared/info-row";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { getProviderIcon } from "@/ee/messaging/provider-icon";

import { accountStatusChipColor, getProviderDisplayLabel } from "./account-status-color";

type Props = {
  accounts: ConnectedAccountDto[];
};

export const ConnectedAccountsCard = observer(({ accounts }: Props) => {
  const t = useTranslations();
  const { connectedAccountsStore, connectedAccountModalStore, intlStore, userStore } = useRootStore();
  const canConnect = userStore.can(Resource.inboxMessages, Action.create);

  useEffect(() => connectedAccountsStore.setItems({ items: accounts }), [accounts, connectedAccountsStore]);

  useEffect(() => {
    connectedAccountsStore.startSyncPolling();
    return () => connectedAccountsStore.stopSyncPolling();
  }, [connectedAccountsStore]);

  const topBarActions = useMemo(
    () =>
      canConnect ? (
        <Button className="h-8" size="sm" onClick={() => void connectedAccountsStore.connectAccount()}>
          <Plus className="size-3.5" />

          <span className="hidden sm:inline">{t("ConnectedAccountsCard.connectAccount")}</span>
        </Button>
      ) : null,
    [canConnect, t, connectedAccountsStore],
  );
  useSetTopBarActions(topBarActions);

  if (connectedAccountsStore.items.length === 0) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-4">
        <Alert color="primary" description={t("ConnectedAccountsCard.description")} />

        <p className="text-subdued text-x-md">{t("ConnectedAccountsCard.emptyState")}</p>
      </div>
    );
  }

  const items = connectedAccountsStore.items;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <Alert color="primary" description={t("ConnectedAccountsCard.description")} />

      <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(20rem,1fr))]">
        {items.map((account) => {
          const statusLabel = t(`ConnectedAccountsCard.statusLabels.${account.status}`);
          const ProviderIcon = getProviderIcon(account.provider);
          const providerLabel = getProviderDisplayLabel(account, t);
          const shownFolders = account.folders.filter((folder) => account.selectedFolderIds.includes(folder.id)).length;

          return (
            <Card
              key={account.id}
              className="cursor-pointer gap-3 py-4 interactive-surface"
              onClick={() => connectedAccountModalStore.openWith(account)}
            >
              <CardContent className="flex flex-col gap-2 px-4">
                <div className="flex items-center gap-2">
                  <ProviderIcon className="size-4 shrink-0" />

                  <p className="truncate text-sm font-medium">{account.displayName ?? providerLabel}</p>
                </div>

                <InfoRow label={t("ConnectedAccountsCard.provider")}>{providerLabel}</InfoRow>

                <InfoRow label={t("ConnectedAccountsCard.status")}>
                  {account.preparing ? (
                    <AppChip startContent={<Loader2 className="animate-spin" />} variant="secondary">
                      {t("ConnectedAccountsCard.preparing")}
                    </AppChip>
                  ) : account.syncing ? (
                    <AppChip startContent={<Loader2 className="animate-spin" />} variant="info">
                      {t("ConnectedAccountsCard.syncing")}
                    </AppChip>
                  ) : (
                    <AppChip variant={accountStatusChipColor(account.status)}>{statusLabel}</AppChip>
                  )}
                </InfoRow>

                <InfoRow label={t("ConnectedAccountsCard.visibility")}>
                  <AppChip variant={account.shared ? "info" : "secondary"}>
                    {account.shared
                      ? t("ConnectedAccountsCard.visibilityShared")
                      : t("ConnectedAccountsCard.visibilityPrivate")}
                  </AppChip>
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
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
});
