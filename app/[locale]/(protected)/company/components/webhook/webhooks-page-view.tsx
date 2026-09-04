"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { WebhookDto } from "@/features/webhook/webhook.schema";

import { observer } from "mobx-react-lite";
import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { DataViewContent } from "@/components/data-view/data-view-content";
import { DataViewEmpty } from "@/components/data-view/data-view-empty";
import { DataViewLayout } from "@/components/data-view/data-view-layout";
import { resolveDataViewPageState, resolveDataViewView } from "@/components/data-view/data-view-state";
import { DataViewToolbar } from "@/components/data-view/data-view-toolbar";
import { useDataViewSync } from "@/components/data-view/use-data-view-sync";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

import { useWebhookColumns } from "./use-webhook-columns";
import { WebhooksPageSkeleton } from "./webhooks-page-skeleton";

type Props = { initialWebhooks: GetResult<WebhookDto> };

export const WebhooksPageView = observer(function WebhooksPageView({ initialWebhooks }: Props) {
  const { webhookModalStore, webhooksStore } = useRootStore();

  useDataViewSync(webhooksStore, initialWebhooks);
  const columns = useWebhookColumns();
  const t = useTranslations();
  const view = resolveDataViewView(webhooksStore.viewMode, webhooksStore.isGrouped);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery: Boolean(webhooksStore.searchTerm?.trim()) || (webhooksStore.filters?.length ?? 0) > 0,
    isGrouped: webhooksStore.isGrouped,
    itemCount: webhooksStore.items.length,
    request: webhooksStore.dataRequest,
    total: webhooksStore.pagination?.total,
  });
  const descriptor = { title: t("WebhooksCard.emptyTitle"), body: t("WebhooksCard.emptyBody") };
  const handleAdd = useCallback(
    () => webhookModalStore.openWith({ url: "", description: undefined, events: [], secret: undefined, enabled: true }),
    [webhookModalStore],
  );
  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        addLabel={pageState === "true-empty" ? t("Common.actions.add") : undefined}
        anchorScope="company-webhooks"
        store={webhooksStore}
        onAdd={handleAdd}
      />
    ),
    [handleAdd, pageState, t, webhooksStore],
  );
  useSetTopBarActions(topBarNode);
  let body: ReactNode;
  switch (pageState) {
    case "error":
      body = (
        <PageState
          action={
            <Button size="sm" variant="secondary" onClick={() => webhooksStore.setQueryOptions({ forceRefresh: true })}>
              {t("ErrorCard.retry")}
            </Button>
          }
          description={t("ErrorCard.contactSupport")}
          state="error"
          title={t("ErrorCard.title")}
        />
      );
      break;
    case "loading":
      body = (
        <PageState background={<WebhooksPageSkeleton view={view} />} label={t("PageState.loading")} state="loading" />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty descriptor={descriptor} reason="filtered" store={webhooksStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          actionLabel={t("Common.actions.add")}
          background={<WebhooksPageSkeleton animated={false} view={view} />}
          descriptor={descriptor}
          reason="true-empty"
          store={webhooksStore}
          onAdd={handleAdd}
        />
      );
      break;
    case "content":
      body = (
        <DataViewContent
          columns={columns}
          store={webhooksStore}
          view={view}
          onRowClick={(item) =>
            webhookModalStore.openWith({
              id: item.id,
              url: item.url,
              description: item.description ?? undefined,
              events: item.events,
              secret: item.secret ?? undefined,
              enabled: item.enabled,
            })
          }
        />
      );
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }
  return (
    <DataViewLayout
      showPagination={pageState === "content" && view !== "board" && !webhooksStore.isGrouped}
      store={webhooksStore}
    >
      {body}
    </DataViewLayout>
  );
});
