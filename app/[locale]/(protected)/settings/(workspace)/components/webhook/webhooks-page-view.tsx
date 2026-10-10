"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { WebhookDto } from "@/features/webhook/webhook.schema";

import { formatWebhookHeaderLines } from "@/features/webhook/webhook-headers";
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
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { RecordRowActions } from "@/app/[locale]/(protected)/records/[typeId]/components/record-row-actions";
import { Action } from "@/generated/prisma";
import { Send } from "lucide-react";
import { WEBHOOK_DELIVERIES_HREF } from "@/app/components/navigation/settings-routes";
import { useRouter } from "@/i18n/navigation";
import { encodeGetParams } from "@/core/utils/get-params";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";

import { useWebhookColumns } from "./use-webhook-columns";
import { WebhooksPageSkeleton } from "./webhooks-page-skeleton";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import type { FocusKind } from "@/components/focus/focus-href";
import { useFocusTarget } from "@/components/focus/focus-target";

type Props = { initialWebhooks: GetResult<WebhookDto> };

const WEBHOOK_FOCUS_KINDS: FocusKind[] = ["webhook"];

const WebhooksPageViewContent = observer(function WebhooksPageView({ initialWebhooks }: Props) {
  const { webhookModalStore, webhooksStore } = useRootStore();

  useDataViewSync(webhooksStore, initialWebhooks);
  const columns = useWebhookColumns();
  const t = useTranslations();
  const router = useRouter();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const view = resolveDataViewView(webhooksStore.viewMode, webhooksStore.canBoard);
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
    () =>
      webhookModalStore.openWith({
        id: undefined,
        recordTrigger: null,
        recordOwnerUserId: undefined,
        url: "",
        description: undefined,
        events: [],
        secret: undefined,
        headers: "",
        bodyTemplate: undefined,
        enabled: true,
      }),
    [webhookModalStore],
  );
  const openWebhook = useCallback(
    (item: (typeof webhooksStore.items)[number]) =>
      webhookModalStore.openWith({
        id: item.id,
        recordTrigger: item.recordTrigger ?? null,
        recordSources: item.recordSources ?? null,
        recordOwnerUserId: item.recordOwnerUserId ?? undefined,
        url: item.url,
        description: item.description ?? undefined,
        events: item.events,
        secret: item.secret ?? undefined,
        headers: formatWebhookHeaderLines(item.headers),
        bodyTemplate: item.bodyTemplate ?? undefined,
        enabled: item.enabled,
        pausedReason: item.pausedReason ?? null,
      }),
    [webhookModalStore],
  );
  const canDeleteWebhooks = webhookModalStore.allows(Action.delete);
  const rowActions = useCallback(
    (item: (typeof webhooksStore.items)[number]) => (
      <RecordRowActions
        contextAction={{
          label: t("WebhooksCard.showDeliveries"),
          icon: Send,
          onSelect: () =>
            router.push(
              `${WEBHOOK_DELIVERIES_HREF}?${encodeGetParams({
                filters: [{ field: FilterFieldKey.webhookId, operator: FilterOperatorKey.in, value: [item.id] }],
              })}`,
            ),
        }}
        name={item.url}
        onDelete={
          canDeleteWebhooks
            ? () => {
                openWebhook(item);
                if (webhookModalStore.ownsRecordAccess) showDeleteConfirmation(() => webhookModalStore.delete());
              }
            : undefined
        }
        onOpen={() => openWebhook(item)}
      />
    ),
    [canDeleteWebhooks, openWebhook, router, showDeleteConfirmation, t, webhookModalStore],
  );
  useFocusTarget(
    WEBHOOK_FOCUS_KINDS,
    (target) => {
      const item = webhooksStore.items.find((webhook) => webhook.id === target.id);
      if (item) openWebhook(item);
      return true;
    },
    pageState !== "loading",
  );
  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        addLabel={pageState === "true-empty" ? t("Common.actions.add") : undefined}
        anchorScope="settings-webhooks"
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
          rowActions={rowActions}
          store={webhooksStore}
          view={view}
          onRowClick={openWebhook}
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

export const WebhooksPageView = serverRenderedClient(WebhooksPageViewContent);
