"use client";

import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { ConnectChannel } from "@/ee/messaging/connect/connect-channels";
import type { MessagingProvider } from "@/generated/prisma";
import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Cable, Info, Loader2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo } from "react";
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
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { PageState } from "@/components/page-state/page-state";
import { resolveResourcePageState, type ResourcePageState } from "@/components/page-state/resource-page-state";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";

import { accountStatusChipColor, getProviderDisplayLabel } from "./account-status-color";
import { ConnectedAccountsPageSkeleton } from "./profile-resource-page-skeleton";
import { PROFILE_RESOURCE_CARD_GRID_CLASS_NAME } from "./profile-resource-page-geometry";

type Props = {
  accounts: ConnectedAccountDto[];
  locked?: boolean;
};

type ConnectedAccountsPageState = ResourcePageState | "locked";

const CONNECT_CHANNEL_OPTIONS: {
  key: ConnectChannel;
  icon: MessagingProvider;
  labelKey: string;
}[] = [
  { key: "google", icon: "google", labelKey: "Common.providers.google" },
  { key: "outlook", icon: "outlook", labelKey: "Common.providers.outlook" },
  {
    key: "imap",
    icon: "mail",
    labelKey: "ConnectedAccountsCard.channels.imap",
  },
  { key: "whatsapp", icon: "whatsapp", labelKey: "Common.providers.whatsapp" },
  {
    key: "linkedin",
    icon: "linkedin",
    labelKey: "ConnectedAccountsCard.channels.linkedinClassic",
  },
  {
    key: "linkedin_sales_navigator",
    icon: "linkedin",
    labelKey: "ConnectedAccountsCard.channels.linkedinSalesNavigator",
  },
  {
    key: "linkedin_recruiter",
    icon: "linkedin",
    labelKey: "ConnectedAccountsCard.channels.linkedinRecruiter",
  },
  {
    key: "instagram",
    icon: "instagram",
    labelKey: "Common.providers.instagram",
  },
  { key: "telegram", icon: "telegram", labelKey: "Common.providers.telegram" },
];

const FEATURED_PROVIDERS: MessagingProvider[] = ["whatsapp", "linkedin", "google"];

const ConnectAction = observer(({ id, variant = "default" }: { id: string; variant?: "default" | "secondary" }) => {
  const t = useTranslations();
  const { connectedAccountsStore } = useRootStore();
  const overflowCount = new Set(CONNECT_CHANNEL_OPTIONS.map((option) => option.icon)).size - FEATURED_PROVIDERS.length;
  const isSecondary = variant === "secondary";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-8" id={id} size="sm" variant={variant}>
          <span className="-space-x-1.5 flex items-center">
            {FEATURED_PROVIDERS.map((provider) => {
              const ChannelIcon = getProviderIcon(provider);
              return (
                <ChannelIcon
                  key={provider}
                  className={cn("size-5 rounded-full ring-2", isSecondary ? "ring-secondary" : "ring-primary")}
                />
              );
            })}

            {overflowCount > 0 && (
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[10px] font-medium ring-2",
                  isSecondary
                    ? "bg-background text-muted-foreground ring-secondary"
                    : "bg-primary-foreground text-primary ring-primary",
                )}
              >
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
            <DropdownMenuItem
              key={option.key}
              onClick={() => runUserAction(() => connectedAccountsStore.connectAccount(option.key))}
            >
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

export const ConnectedAccountsPageView = observer(({ accounts, locked = false }: Props) => {
  const t = useTranslations();
  const { connectedAccountsStore, connectedAccountModalStore, userStore } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const canConnect = userStore.can(Resource.inboxMessages, Action.create);

  useLayoutEffect(() => connectedAccountsStore.setItems({ items: accounts }), [accounts, connectedAccountsStore]);

  useEffect(() => {
    if (locked) return;
    connectedAccountsStore.startSyncPolling();
    return () => connectedAccountsStore.stopSyncPolling();
  }, [connectedAccountsStore, locked]);

  const pageState: ConnectedAccountsPageState = locked
    ? "locked"
    : resolveResourcePageState(connectedAccountsStore.dataRequest, connectedAccountsStore.items.length);
  const topBarActions = useMemo(
    () =>
      pageState !== "locked" && pageState !== "loading" && pageState !== "error" && canConnect ? (
        <ConnectAction id="profile-connected-accounts-connect" />
      ) : null,
    [canConnect, pageState],
  );
  useSetTopBarActions(topBarActions);

  let body: ReactNode;
  switch (pageState) {
    case "locked":
      body = <ConnectedAccountsPageSkeleton animated={false} />;
      break;
    case "loading":
      body = (
        <PageState background={<ConnectedAccountsPageSkeleton />} label={t("PageState.loading")} state="loading" />
      );
      break;
    case "error":
      body = (
        <PageState
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => runUserAction(() => connectedAccountsStore.refreshQuery().catch(() => undefined))}
            >
              {t("ErrorCard.retry")}
            </Button>
          }
          description={t("ErrorCard.contactSupport")}
          state="error"
          title={t("ErrorCard.title")}
        />
      );
      break;
    case "true-empty":
      body = (
        <PageState
          action={
            canConnect ? <ConnectAction id="profile-connected-accounts-connect-empty" variant="secondary" /> : undefined
          }
          background={<ConnectedAccountsPageSkeleton animated={false} />}
          description={t("ConnectedAccountsCard.emptyState")}
          icon={Cable}
          state="empty"
          title={t("ConnectedAccountsCard.title")}
        />
      );
      break;
    case "content":
      body = (
        <div className="animate-page-result-in flex w-full max-w-3xl flex-col gap-4 motion-reduce:animate-none">
          <ConnectedAccountsAlert />

          <div className={PROFILE_RESOURCE_CARD_GRID_CLASS_NAME}>
            {connectedAccountsStore.items.map((account) => {
              const statusLabel = t(`ConnectedAccountsCard.statusLabels.${account.status}`);
              const ProviderIcon = getProviderIcon(account.provider);
              const providerLabel = getProviderDisplayLabel(account, t);
              const shownFolders = account.folders.filter((folder) =>
                account.selectedFolderIds.includes(folder.id),
              ).length;

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

                    {account.folders.length > 0 ? (
                      <InfoRow label={t("ConnectedAccountsCard.folders")}>
                        {t("ConnectedAccountsCard.foldersShown", {
                          shown: shownFolders,
                          total: account.folders.length,
                        })}
                      </InfoRow>
                    ) : null}

                    <InfoRow label={t("ConnectedAccountsCard.connectedAt")}>
                      {intlStore.formatNumericalShortDateTime(account.createdAt)}
                    </InfoRow>

                    {account.lastSyncedAt ? (
                      <InfoRow label={t("ConnectedAccountsCard.lastSynced")}>
                        {intlStore.formatNumericalShortDateTime(account.lastSyncedAt)}
                      </InfoRow>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      );
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return body;
});
