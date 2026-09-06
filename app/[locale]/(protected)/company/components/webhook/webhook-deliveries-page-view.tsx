"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { WebhookDeliveryDto } from "@/features/webhook/get-webhook-deliveries.interactor";

import { observer } from "mobx-react-lite";
import { useMemo } from "react";
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

import { useWebhookDeliveryColumns } from "./use-webhook-delivery-columns";
import { WebhookDeliveriesPageSkeleton } from "./webhook-deliveries-page-skeleton";

type Props = { initialDeliveries: GetResult<WebhookDeliveryDto> };

export const WebhookDeliveriesPageView = observer(function WebhookDeliveriesPageView({ initialDeliveries }: Props) {
  const { webhookDeliveriesStore, webhookDeliveryModalStore } = useRootStore();

  useDataViewSync(webhookDeliveriesStore, initialDeliveries);
  const columns = useWebhookDeliveryColumns();
  const t = useTranslations();
  const view = resolveDataViewView(webhookDeliveriesStore.viewMode, webhookDeliveriesStore.canBoard);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery:
      Boolean(webhookDeliveriesStore.searchTerm?.trim()) || (webhookDeliveriesStore.filters?.length ?? 0) > 0,
    isGrouped: webhookDeliveriesStore.isGrouped,
    itemCount: webhookDeliveriesStore.items.length,
    request: webhookDeliveriesStore.dataRequest,
    total: webhookDeliveriesStore.pagination?.total,
  });
  const descriptor = { title: t("WebhookDeliveriesCard.emptyTitle"), body: t("WebhookDeliveriesCard.emptyBody") };
  const topBarNode = useMemo(
    () => <DataViewToolbar anchorScope="company-webhook-deliveries" store={webhookDeliveriesStore} />,
    [webhookDeliveriesStore],
  );
  useSetTopBarActions(topBarNode);
  let body: ReactNode;
  switch (pageState) {
    case "error":
      body = (
        <PageState
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => webhookDeliveriesStore.setQueryOptions({ forceRefresh: true })}
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
    case "loading":
      body = (
        <PageState
          background={<WebhookDeliveriesPageSkeleton view={view} />}
          label={t("PageState.loading")}
          state="loading"
        />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty descriptor={descriptor} reason="filtered" store={webhookDeliveriesStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          background={<WebhookDeliveriesPageSkeleton animated={false} view={view} />}
          descriptor={descriptor}
          reason="true-empty"
          store={webhookDeliveriesStore}
        />
      );
      break;
    case "content":
      body = (
        <DataViewContent
          columns={columns}
          store={webhookDeliveriesStore}
          view={view}
          onRowClick={(item) => {
            webhookDeliveryModalStore.onInitOrRefresh(item);
            webhookDeliveryModalStore.open();
          }}
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
      showPagination={pageState === "content" && view !== "board" && !webhookDeliveriesStore.isGrouped}
      store={webhookDeliveriesStore}
    >
      {body}
    </DataViewLayout>
  );
});
