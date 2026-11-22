"use client";

import type { AiConnectionProvider } from "@/components/ai-connection/ai-connection.store";
import type { ConnectedApp } from "@/features/connected-apps/connected-app.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Plug } from "lucide-react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { aiAppLogoProvider, aiAppsNotYetConnected } from "./ai-app-client";
import {
  SettingsPanel,
  SettingsPanelAddButton,
  SettingsPanelAddRow,
  SettingsPanelLogo,
  SettingsPanelMessage,
  SettingsPanelRow,
} from "@/components/shared/settings-panel";

const AiAppLogo = ({ name }: { name: string }) => {
  const provider = aiAppLogoProvider(name);
  return provider ? (
    <AiClientLogo provider={provider} />
  ) : (
    <Plug aria-hidden className="size-5 text-muted-foreground" />
  );
};

export const AiAppsSection = observer(() => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { apiKeyModalStore, apiKeysStore, connectedAppsStore: store } = useRootStore();
  const { showConfirmation } = useDeleteConfirmation();
  const canManage = apiKeysStore.canManage;
  const available = aiAppsNotYetConnected(store.items.map((app) => app.name));

  function disconnect(app: ConnectedApp) {
    showConfirmation({
      title: t("ConnectedApps.disconnectTitle"),
      message: t("ConnectedApps.disconnectDescription", { name: app.name }),
      confirmLabel: t("ConnectedAccountsCard.disconnect"),
      confirmVariant: "destructive",
      successKey: "ConnectedApps.toastDisconnected",
      onConfirm: () => store.disconnect(app.id),
    });
  }

  function connect(provider?: AiConnectionProvider) {
    apiKeyModalStore.add();
    if (provider) apiKeyModalStore.aiConnectionStore.selectProvider(provider);
  }

  return (
    <SettingsPanel
      description={t("Connections.apps.description")}
      id="connections-apps"
      title={t("Connections.apps.title")}
    >
      {store.items.length === 0 ? (
        <SettingsPanelMessage>
          <span data-connected-apps-empty="">{t("ConnectedApps.empty")}</span>
        </SettingsPanelMessage>
      ) : (
        store.items.map((app) => (
          <SettingsPanelRow key={app.id} data-connected-app={app.id}>
            <SettingsPanelLogo>
              <AiAppLogo name={app.name} />
            </SettingsPanelLogo>

            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{app.name}</span>

                <span className="flex items-center gap-1 text-xs text-success-soft-foreground">
                  <span aria-hidden className="size-1.5 rounded-full bg-success" />

                  {t("Connections.apps.connected")}
                </span>
              </span>

              <span className="truncate text-xs text-muted-foreground">
                {app.device ? `${app.device} · ` : null}

                {t("Connections.apps.detail", {
                  since: intlStore.formatDescriptiveShortDate(new Date(app.connectedAt)),
                  active: intlStore.formatRelativeTime(new Date(app.lastActiveAt)),
                })}
              </span>
            </span>

            <Button size="sm" variant="ghost" onClick={() => disconnect(app)}>
              {t("ConnectedAccountsCard.disconnect")}
            </Button>
          </SettingsPanelRow>
        ))
      )}

      {canManage ? (
        <SettingsPanelAddRow
          trailing={
            available.length > 0 ? (
              <span className="flex items-center gap-1.5" data-connections-also-works="">
                {available.map((provider) => {
                  const label = t(`Connections.apps.clients.${provider}`);
                  return (
                    <Tooltip key={provider}>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={label}
                          className="rounded-full"
                          data-connect-ai-app={provider}
                          size="icon-sm"
                          variant="secondary"
                          onClick={() => connect(provider)}
                        >
                          <AiClientLogo className="size-4" provider={provider === "openai" ? "chatgpt" : provider} />
                        </Button>
                      </TooltipTrigger>

                      <TooltipContent>{label}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </span>
            ) : null
          }
        >
          <SettingsPanelAddButton
            hint={t("Connections.apps.connectHint")}
            id="connections-ai-apps-connect"
            label={t("Connections.apps.connect")}
            onClick={() => connect()}
          />
        </SettingsPanelAddRow>
      ) : null}
    </SettingsPanel>
  );
});
