"use client";

import type { AiConnectionProvider } from "@/components/ai-connection/ai-connection.store";
import type { ConnectedApp } from "@/features/connected-apps/connected-app.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Plug, Plus } from "lucide-react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { Button } from "@/components/ui/button";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { aiAppLogoProvider, aiAppsNotYetConnected } from "./ai-app-client";
import {
  SettingsPanel,
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
      action={
        canManage ? (
          <Button id="connections-ai-apps-connect" size="sm" variant="secondary" onClick={() => connect()}>
            <Plus aria-hidden />

            {t("Connections.apps.connect")}
          </Button>
        ) : null
      }
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
        <div
          className="-mt-px flex flex-wrap items-center gap-2 border-t bg-muted/30 px-4 py-3"
          data-connections-also-works=""
        >
          <span className="me-1 text-xs text-muted-foreground">{t("Connections.apps.alsoWorksWith")}</span>

          {available.map((provider) => (
            <Button
              key={provider}
              data-connect-ai-app={provider}
              size="sm"
              variant="secondary"
              onClick={() => connect(provider)}
            >
              <AiClientLogo className="size-4" provider={provider === "openai" ? "chatgpt" : provider} />

              {t(`Connections.apps.clients.${provider}`)}
            </Button>
          ))}

          <Button data-connect-ai-app="other" size="sm" variant="secondary" onClick={() => connect()}>
            <Plus aria-hidden />

            {t("Connections.apps.otherApp")}
          </Button>
        </div>
      ) : null}
    </SettingsPanel>
  );
});
