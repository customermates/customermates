"use client";

import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Cable, Info, Loader2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { Action, Resource } from "@/generated/prisma";

import { AgentStarterActions } from "@/app/components/agent-chat/suggested-questions";
import { Alert } from "@/components/shared/alert";
import { AppChip } from "@/components/chip/app-chip";
import { AvatarStack } from "@/components/shared/avatar-stack";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { InfoRow } from "@/components/shared/info-row";
import { AppLink } from "@/components/shared/app-link";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { TopBarPrimaryButton } from "@/components/shared/top-bar-action-buttons";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { PageState } from "@/components/page-state/page-state";
import { resolveResourcePageState, type ResourcePageState } from "@/components/page-state/resource-page-state";
import { runUserAction } from "@/core/errors/report-application-error";

import { accountStatusChipColor, getProviderDisplayLabel } from "./account-status-color";
import { ConnectedAccountsPageSkeleton } from "./profile-resource-page-skeleton";
import { PROFILE_RESOURCE_CARD_GRID_CLASS_NAME } from "./profile-resource-page-geometry";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { CONNECT_INTENT_CHANNELS } from "@/components/keyboard/connect-intent";
import { ConnectMenuItems, ConnectProviderStack } from "@/components/channels/connect-channel-menu";
import { useConnectIntent } from "@/components/keyboard/use-connect-intent";

type Props = {
  accounts: ConnectedAccountDto[];
  locked?: boolean;
};

type ConnectedAccountsPageState = ResourcePageState | "locked";

const ConnectTopBarAction = () => {
  const t = useTranslations();

  return (
    <TopBarPrimaryButton
      anchorId="settings-channels-connect"
      label={t("ConnectedAccountsCard.connectAccount")}
      leading={<ConnectProviderStack onPrimary />}
      menu={<ConnectMenuItems />}
    />
  );
};

const ConnectEmptyStateAction = () => {
  const t = useTranslations();
  const id = "settings-channels-connect-empty";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("ConnectedAccountsCard.connectAccount")}
          className="h-8"
          id={id}
          size="sm"
          variant="secondary"
        >
          <ConnectProviderStack onPrimary={false} />

          <span className="hidden sm:inline">{t("ConnectedAccountsCard.connectAccount")}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" aria-labelledby={id}>
        <ConnectMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const ConnectedAccountsAlert = () => {
  const t = useTranslations();

  return (
    <Alert
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
      variant="neutral"
    />
  );
};

const ConnectedAccountsPageViewContent = observer(({ accounts, locked = false }: Props) => {
  const t = useTranslations();
  const { connectedAccountsStore, connectedAccountModalStore, userStore } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const canConnect = userStore.can(Resource.inboxMessages, Action.create);
  useConnectIntent(CONNECT_INTENT_CHANNELS, canConnect && !locked, (channel) =>
    runUserAction(() => connectedAccountsStore.connectAccount(channel)),
  );

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
        <ConnectTopBarAction />
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
            <AgentStarterActions
              fallback={canConnect ? <ConnectEmptyStateAction /> : undefined}
              pageId="connected-accounts"
              state="empty"
              surface="page"
            />
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
                  className="cursor-pointer gap-3 py-4 interactive-surface outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  role="button"
                  tabIndex={0}
                  onClick={() => connectedAccountModalStore.openWith(account)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;

                    event.preventDefault();
                    connectedAccountModalStore.openWith(account);
                  }}
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

export const ConnectedAccountsPageView = serverRenderedClient(ConnectedAccountsPageViewContent);
