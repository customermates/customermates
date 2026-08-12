"use client";

import type { ApiKey } from "@/features/api-key/get-api-keys.interactor";
import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { KeyRound, Plus } from "lucide-react";
import { useLayoutEffect, useMemo } from "react";

import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InfoRow } from "@/components/shared/info-row";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { PageState } from "@/components/page-state/page-state";
import { resolveResourcePageState } from "@/components/page-state/resource-page-state";

import { ApiKeysPageSkeleton } from "./profile-resource-page-skeleton";
import { PROFILE_RESOURCE_CARD_GRID_CLASS_NAME } from "./profile-resource-page-geometry";

type Props = {
  apiKeys: ApiKey[];
};

export const ApiKeysPageView = observer(({ apiKeys }: Props) => {
  const t = useTranslations();
  const { apiKeyModalStore, apiKeysStore, intlStore } = useRootStore();
  const { canManage } = apiKeysStore;

  useLayoutEffect(() => apiKeysStore.setItems({ items: apiKeys }), [apiKeys]);

  const pageState = resolveResourcePageState(apiKeysStore.dataRequest, apiKeysStore.items.length);
  const topBarActions = useMemo(
    () =>
      pageState !== "loading" && pageState !== "error" && canManage ? (
        <Button
          className="h-8"
          id="profile-api-keys-generate"
          size="sm"
          variant="default"
          onClick={() => void apiKeyModalStore.add()}
        >
          <Plus className="size-3.5" />

          <span className="hidden sm:inline">{t("Common.actions.add")}</span>
        </Button>
      ) : null,
    [apiKeyModalStore, canManage, pageState, t],
  );
  useSetTopBarActions(topBarActions);

  let body: ReactNode;
  switch (pageState) {
    case "loading":
      body = <PageState background={<ApiKeysPageSkeleton />} label={t("PageState.loading")} state="loading" />;
      break;
    case "error":
      body = (
        <PageState
          action={
            <Button size="sm" variant="outline" onClick={() => void apiKeysStore.refreshQuery().catch(() => undefined)}>
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
            canManage ? (
              <Button size="sm" variant="secondary" onClick={() => void apiKeyModalStore.add()}>
                {t("Common.actions.add")}
              </Button>
            ) : undefined
          }
          background={<ApiKeysPageSkeleton animated={false} />}
          description={t("ProfileSections.apiKeysDescription")}
          icon={KeyRound}
          state="empty"
          title={t("Common.emptyState.genericTitle")}
        />
      );
      break;
    case "content":
      body = (
        <div className="animate-page-result-in flex w-full max-w-3xl flex-col gap-4 motion-reduce:animate-none">
          <Alert color="primary" description={t("ProfileSections.apiKeysDescription")} />

          <div className={PROFILE_RESOURCE_CARD_GRID_CLASS_NAME}>
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
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return body;
});
