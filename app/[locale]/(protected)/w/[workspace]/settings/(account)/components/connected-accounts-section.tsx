"use client";

import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ExternalLink, Loader2, Plug, RefreshCw, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { Action, Resource } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ItemActions, ItemActionsTrigger } from "@/components/ui/item-actions";
import { Spinner } from "@/components/ui/spinner";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { resolveResourcePageState, type ResourcePageState } from "@/components/page-state/resource-page-state";
import { runUserAction } from "@/core/errors/report-application-error";
import { ConnectMenuItems, ConnectProviderStack } from "@/components/channels/connect-channel-menu";
import { PlanUpsellNotice } from "@/app/components/upsell/plan-upsell-notice";
import { MESSAGING_UPSELL_PLAN } from "@/app/components/upsell/plan-upsell-highlights";

import { accountStatusChipColor, getProviderDisplayLabel } from "./account-status-color";
import { connectedAccountActions, connectedAccountCapabilities } from "./connected-account-actions";
import {
  SettingsPanel,
  SettingsPanelAddButton,
  SettingsPanelAddRow,
  SettingsPanelLogo,
  SettingsPanelMessage,
  SettingsPanelRow,
} from "@/components/shared/settings-panel";

type Props = { locked?: boolean };

type ConnectedAccountsSectionState = ResourcePageState | "locked";

const ConnectAccountMenu = () => {
  const t = useTranslations();

  return (
    <SettingsPanelAddRow trailing={<ConnectProviderStack onPrimary={false} />}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SettingsPanelAddButton
            hint={t("Connections.inbox.connectHint")}
            id="settings-channels-connect"
            label={t("Connections.inbox.connect")}
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" aria-labelledby="settings-channels-connect">
          <ConnectMenuItems />
        </DropdownMenuContent>
      </DropdownMenu>
    </SettingsPanelAddRow>
  );
};

const PrivacyNote = () => {
  const t = useTranslations();

  return (
    <p className="text-xs text-muted-foreground" data-connections-privacy-note="">
      {t.rich("Connections.inbox.privacyNote", {
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
    </p>
  );
};

function accountTitle(account: ConnectedAccountDto, t: ReturnType<typeof useTranslations>) {
  return account.provider === "linkedin"
    ? getProviderDisplayLabel(account, t)
    : t(`Common.providers.${account.provider}`);
}

const ConnectedAccountRow = observer(({ account }: { account: ConnectedAccountDto }) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { connectedAccountModalStore, connectedAccountsStore, userStore } = useRootStore();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const ProviderIcon = getProviderIcon(account.provider);
  const title = accountTitle(account, t);
  const address = account.emailAddress ?? account.displayName;
  const actions = connectedAccountActions(account, {
    canUpdate: userStore.can(Resource.inboxMessages, Action.update),
    canDelete: userStore.can(Resource.inboxMessages, Action.delete),
  });
  const details = [
    address,
    account.syncing
      ? t("ConnectedAccountsCard.syncing")
      : account.lastSyncedAt
        ? t("Connections.inbox.synced", { time: intlStore.formatRelativeTime(new Date(account.lastSyncedAt)) })
        : null,
    account.isOwner
      ? null
      : t("Connections.inbox.sharedBy", { name: `${account.owner.firstName} ${account.owner.lastName}`.trim() }),
  ].filter(Boolean);
  const label = t("Connections.inbox.actions", { name: address ?? title });

  const menu = (
    <>
      <DropdownMenuItem onSelect={() => connectedAccountModalStore.openWith(account)}>
        <ExternalLink aria-hidden />

        {t("RecordModel.openDetails")}
      </DropdownMenuItem>

      {actions.resync ? (
        <DropdownMenuItem onSelect={() => runUserAction(() => connectedAccountsStore.resync(account.id))}>
          <RefreshCw aria-hidden />

          {t("ConnectedAccountsCard.resync")}
        </DropdownMenuItem>
      ) : null}

      {actions.reconnect ? (
        <DropdownMenuItem onSelect={() => runUserAction(() => connectedAccountsStore.reconnect(account.id))}>
          <Plug aria-hidden />

          {t("ConnectedAccountsCard.reactivate")}
        </DropdownMenuItem>
      ) : null}

      {actions.disconnect ? (
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => showDeleteConfirmation(() => connectedAccountsStore.disconnect(account.id), address ?? title)}
        >
          <Trash2 aria-hidden />

          {t("ConnectedAccountsCard.disconnect")}
        </DropdownMenuItem>
      ) : null}
    </>
  );

  return (
    <ItemActions label={label} menu={menu}>
      <SettingsPanelRow data-connected-account={account.id} data-status={account.status}>
        <button
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          type="button"
          onClick={() => connectedAccountModalStore.openWith(account)}
        >
          <SettingsPanelLogo>
            <ProviderIcon className="size-5" />
          </SettingsPanelLogo>

          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-medium">{title}</span>

              {connectedAccountCapabilities(account).map((capability) => (
                <AppChip key={capability} size="sm" variant="secondary">
                  {t(`Connections.inbox.capabilities.${capability}`)}
                </AppChip>
              ))}

              {account.status !== "ok" && !account.syncing ? (
                <AppChip size="sm" variant={accountStatusChipColor(account.status)}>
                  {t(`ConnectedAccountsCard.statusLabels.${account.status}`)}
                </AppChip>
              ) : null}
            </span>

            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              {account.syncing ? <Loader2 aria-hidden className="size-3 shrink-0 animate-spin" /> : null}

              <span className="truncate">{details.join(" · ")}</span>
            </span>
          </span>
        </button>

        <ItemActionsTrigger />

        <AppChip variant={account.shared ? "info" : "secondary"}>
          {account.shared ? t("ConnectedAccountsCard.visibilityShared") : t("ConnectedAccountsCard.visibilityPrivate")}
        </AppChip>
      </SettingsPanelRow>
    </ItemActions>
  );
});

export const ConnectedAccountsSection = observer(({ locked = false }: Props) => {
  const t = useTranslations();
  const { connectedAccountsStore, userStore } = useRootStore();
  const canConnect = userStore.can(Resource.inboxMessages, Action.create);

  useEffect(() => {
    if (locked) return;
    connectedAccountsStore.startSyncPolling();
    return () => connectedAccountsStore.stopSyncPolling();
  }, [connectedAccountsStore, locked]);

  const pageState: ConnectedAccountsSectionState = locked
    ? "locked"
    : resolveResourcePageState(connectedAccountsStore.dataRequest, connectedAccountsStore.items.length);

  let body: ReactNode;
  switch (pageState) {
    case "locked":
      body = (
        <div className="p-4">
          <PlanUpsellNotice
            stacked
            detail={t("MessagingUpsell.description")}
            id="connections-messaging"
            plan={MESSAGING_UPSELL_PLAN}
            title={t("MessagingUpsell.title")}
          />
        </div>
      );
      break;
    case "loading":
      body = (
        <SettingsPanelMessage>
          <Spinner aria-label={t("PageState.loading")} size="sm" />
        </SettingsPanelMessage>
      );
      break;
    case "error":
      body = (
        <SettingsPanelMessage>
          <span>{t("ErrorCard.title")}</span>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => runUserAction(() => connectedAccountsStore.refreshQuery().catch(() => undefined))}
          >
            {t("ErrorCard.retry")}
          </Button>
        </SettingsPanelMessage>
      );
      break;
    case "true-empty":
      body = (
        <SettingsPanelMessage>
          <span data-connected-accounts-empty="">{t("Connections.inbox.empty")}</span>
        </SettingsPanelMessage>
      );
      break;
    case "content":
      body = connectedAccountsStore.items.map((account) => <ConnectedAccountRow key={account.id} account={account} />);
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return (
    <SettingsPanel
      description={t("Connections.inbox.description")}
      footer={locked ? null : <PrivacyNote />}
      id="connections-inbox"
      title={t("Connections.inbox.title")}
    >
      {body}

      {canConnect && !locked && pageState !== "loading" && pageState !== "error" ? <ConnectAccountMenu /> : null}
    </SettingsPanel>
  );
});
