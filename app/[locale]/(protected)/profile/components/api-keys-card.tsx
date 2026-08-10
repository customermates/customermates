"use client";

import type { ApiKey } from "@/features/api-key/get-api-keys.interactor";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { useEffect, useMemo } from "react";

import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InfoRow } from "@/components/shared/info-row";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { PageState } from "@/components/page-state/page-state";

type Props = {
  apiKeys: ApiKey[];
};

export const ApiKeysCard = observer(({ apiKeys }: Props) => {
  const t = useTranslations();
  const { apiKeyModalStore, apiKeysStore, intlStore } = useRootStore();
  const { canManage } = apiKeysStore;
  const isTrueEmpty = apiKeysStore.isReady && apiKeysStore.items.length === 0;

  useEffect(() => apiKeysStore.setItems({ items: apiKeys }), [apiKeys]);

  const topBarActions = useMemo(
    () =>
      apiKeysStore.isReady && canManage ? (
        <Button
          className="h-8"
          id="profile-api-keys-generate"
          size="sm"
          variant={isTrueEmpty ? "secondary" : "default"}
          onClick={() => void apiKeyModalStore.add()}
        >
          <Plus className="size-3.5" />

          <span className="hidden sm:inline">{t("Common.actions.add")}</span>
        </Button>
      ) : null,
    [apiKeyModalStore, apiKeysStore.isReady, t, canManage, isTrueEmpty],
  );
  useSetTopBarActions(topBarActions);

  if (!apiKeysStore.isReady)
    return <PageState label={t("PageState.loading")} skeleton={{ kind: "settings" }} state="loading" />;

  if (isTrueEmpty) {
    return (
      <PageState
        action={
          canManage ? (
            <Button size="sm" onClick={() => void apiKeyModalStore.add()}>
              {t("Common.actions.add")}
            </Button>
          ) : undefined
        }
        description={t("ProfileSections.apiKeysDescription")}
        skeleton={{ kind: "settings" }}
        state="empty"
        title={t("Common.emptyState.genericTitle")}
      />
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <Alert color="primary" description={t("ProfileSections.apiKeysDescription")} />

      <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(20rem,1fr))]">
        {apiKeysStore.items.map((key) => (
          <Card
            key={key.id}
            className="cursor-pointer gap-3 py-4 interactive-surface"
            onClick={() => apiKeyModalStore.view(key)}
          >
            <CardContent className="flex flex-col gap-2 px-4">
              <p className="truncate text-sm font-medium">{key.name || t("ApiKeysCard.unnamed")}</p>

              <InfoRow label={t("Common.table.columns.createdAt")}>
                {intlStore.formatNumericalShortDateTime(key.createdAt)}
              </InfoRow>

              <InfoRow label={t("Common.table.columns.expiresAt")}>
                {key.expiresAt ? intlStore.formatNumericalShortDateTime(key.expiresAt) : t("Common.never")}
              </InfoRow>

              <InfoRow label={t("Common.table.columns.lastRequest")}>
                {key.lastRequest ? intlStore.formatNumericalShortDateTime(key.lastRequest) : t("Common.never")}
              </InfoRow>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
});
