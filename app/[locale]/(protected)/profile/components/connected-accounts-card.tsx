"use client";

import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { ConnectChannel } from "@/ee/messaging/connect/connect-channels";
import type { MessagingProvider } from "@/generated/prisma";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Info, Loader2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Action, Resource } from "@/generated/prisma";

import { Alert } from "@/components/shared/alert";
import { AppChip } from "@/components/chip/app-chip";
import { AvatarStack } from "@/components/shared/avatar-stack";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { InfoRow } from "@/components/shared/info-row";
import { AppLink } from "@/components/shared/app-link";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { PageState } from "@/components/page-state/page-state";
import { PageSkeleton } from "@/components/page-state/page-skeleton";

import { accountStatusChipColor, getProviderDisplayLabel } from "./account-status-color";

type Props = {
  accounts: ConnectedAccountDto[];
  locked?: boolean;
};

const CONNECT_CHANNEL_OPTIONS: { key: ConnectChannel; icon: MessagingProvider; labelKey: string }[] = [
  { key: "google", icon: "google", labelKey: "Common.providers.google" },
  { key: "outlook", icon: "outlook", labelKey: "Common.providers.outlook" },
  { key: "imap", icon: "mail", labelKey: "ConnectedAccountsCard.channels.imap" },
  { key: "whatsapp", icon: "whatsapp", labelKey: "Common.providers.whatsapp" },
  { key: "linkedin", icon: "linkedin", labelKey: "ConnectedAccountsCard.channels.linkedinClassic" },
  {
    key: "linkedin_sales_navigator",
    icon: "linkedin",
    labelKey: "ConnectedAccountsCard.channels.linkedinSalesNavigator",
  },
  { key: "linkedin_recruiter", icon: "linkedin", labelKey: "ConnectedAccountsCard.channels.linkedinRecruiter" },
  { key: "instagram", icon: "instagram", labelKey: "Common.providers.instagram" },
  { key: "telegram", icon: "telegram", labelKey: "Common.providers.telegram" },
];

const FEATURED_PROVIDERS: MessagingProvider[] = ["whatsapp", "linkedin", "google"];

const ConnectAction = observer(({ id, variant = "default" }: { id: string; variant?: "default" | "secondary" }) => {
  const t = useTranslations();
  const { connectedAccountsStore } = useRootStore();
  const overflowCount = new Set(CONNECT_CHANNEL_OPTIONS.map((option) => option.icon)).size - FEATURED_PROVIDERS.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-8" id={id} size="sm" variant={variant}>
          <span className="-space-x-1.5 flex items-center">
            {FEATURED_PROVIDERS.map((provider) => {
              const ChannelIcon = getProviderIcon(provider);
              return <ChannelIcon key={provider} className="ring-primary size-5 rounded-full ring-2" />;
            })}

            {overflowCount > 0 && (
              <span className="bg-primary-foreground text-primary ring-primary flex size-5 items-center justify-center rounded-full text-[10px] font-medium ring-2">
                +{overflowCount}
              </span>
            )}
          </span>

          <span className="hidden sm:inline">{t("ConnectedAccountsCard.connectAccount")}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        {CONNECT_CHANNEL_OPTIONS.map((option) => {
          const ChannelIcon = getProviderIcon(option.icon);
          return (
            <DropdownMenuItem key={option.key} onClick={() => void connectedAccountsStore.connectAccount(option.key)}>
              <ChannelIcon className="size-4" />

              {t(option.labelKey)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

const ConnectedAccountsAlert = () => {
  const t = useTranslations();

  return (
    <Alert
      color="primary"
      description={t.rich("ConnectedAccountsCard.description", {
        dataPrivacyLink: (chunks) => (
          <AppLink inheritSize appearance="inline" href="/privacy" target="_blank">
            {chunks}
          </AppLink>
        ),
        subprocessorsLink: (chunks) => (
          <AppLink inheritSize appearance="inline" href="/subprocessors" target="_blank">
            {chunks}
          </AppLink>
        ),
        termsOfServiceLink: (chunks) => (
          <AppLink inheritSize appearance="inline" href="/terms" target="_blank">
            {chunks}
          </AppLink>
        ),
      })}
    />
  );
};

export const ConnectedAccountsCard = observer(({ accounts, locked = false }: Props) => {
  const t = useTranslations();
  const { connectedAccountsStore, connectedAccountModalStore, intlStore, userStore } = useRootStore();
  const canConnect = userStore.can(Resource.inboxMessages, Action.create);
  const isTrueEmpty = connectedAccountsStore.isReady && connectedAccountsStore.items.length === 0;

  useEffect(() => connectedAccountsStore.setItems({ items: accounts }), [accounts, connectedAccountsStore]);

  useEffect(() => {
    connectedAccountsStore.startSyncPolling();
    return () => connectedAccountsStore.stopSyncPolling();
  }, [connectedAccountsStore]);

  const topBarActions = useMemo(
    () =>
      !locked && connectedAccountsStore.isReady && canConnect ? (
        <ConnectAction id="profile-connected-accounts-connect" variant={isTrueEmpty ? "secondary" : "default"} />
      ) : null,
    [canConnect, connectedAccountsStore.isReady, isTrueEmpty, locked],
  );
  useSetTopBarActions(topBarActions);

  if (locked) return <PageSkeleton animated={false} spec={{ kind: "settings" }} />;

  if (!connectedAccountsStore.isReady)
    return <PageState label={t("PageState.loading")} skeleton={{ kind: "settings" }} state="loading" />;

  if (isTrueEmpty) {
    return (
      <PageState
        action={canConnect ? <ConnectAction id="profile-connected-accounts-connect-empty" /> : undefined}
        description={t("ConnectedAccountsCard.emptyState")}
        skeleton={{ kind: "settings" }}
        state="empty"
        title={t("ConnectedAccountsCard.title")}
      />
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <ConnectedAccountsAlert />

      <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(20rem,1fr))]">
        {connectedAccountsStore.items.map((account) => {
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
