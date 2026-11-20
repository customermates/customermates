"use client";

import type { ConnectedApp } from "@/features/connected-apps/connected-app.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InfoRow } from "@/components/shared/info-row";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { PROFILE_RESOURCE_CARD_GRID_CLASS_NAME } from "./profile-resource-page-geometry";

export const ConnectedAppsCard = observer(() => {
  const t = useTranslations();
  const { apiKeyModalStore, apiKeysStore, connectedAppsStore: store } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const { showConfirmation } = useDeleteConfirmation();

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

  return (
    <section className="flex w-full flex-col gap-4" data-connected-apps-card="">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-x-lg">{t("ConnectedApps.title")}</h2>

        <p className="text-sm text-muted-foreground">{t("ConnectedApps.description")}</p>
      </div>

      {store.items.length > 0 ? (
        <div className={PROFILE_RESOURCE_CARD_GRID_CLASS_NAME}>
          {store.items.map((app) => (
            <Card key={app.id} className="gap-3 py-4" data-connected-app={app.id}>
              <CardContent className="flex flex-col gap-2 px-4">
                <p className="truncate text-sm font-medium">{app.name}</p>

                <InfoRow label={t("ConnectedApps.connectedSince")}>
                  {intlStore.formatNumericalShortDateTime(app.connectedAt)}
                </InfoRow>

                <InfoRow label={t("ConnectedApps.lastActive")}>
                  {intlStore.formatNumericalShortDateTime(app.lastActiveAt)}
                </InfoRow>

                <div className="flex justify-end pt-1">
                  <Button size="sm" variant="ghost" onClick={() => disconnect(app)}>
                    {t("ConnectedAccountsCard.disconnect")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3" data-connected-apps-empty="">
          <p className="text-sm text-muted-foreground">{t("ConnectedApps.empty")}</p>

          {apiKeysStore.canManage ? (
            <Button size="sm" variant="secondary" onClick={() => apiKeyModalStore.add()}>
              {t("ConnectedApps.connect")}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
});
