"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { IncomingWebhookDto } from "@/features/incoming-webhook/incoming-webhook.schema";

import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { DataViewContent } from "@/components/data-view/data-view-content";
import { DataViewEmpty } from "@/components/data-view/data-view-empty";
import { DataViewLayout } from "@/components/data-view/data-view-layout";
import { resolveDataViewPageState, resolveDataViewView } from "@/components/data-view/data-view-state";
import { DataViewToolbar } from "@/components/data-view/data-view-toolbar";
import { RowActions } from "@/components/data-view/row-actions";
import { useDataViewSync } from "@/components/data-view/use-data-view-sync";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { Action } from "@/generated/prisma";

import { IncomingWebhookDeliveries } from "./incoming-webhook-deliveries";
import { IncomingWebhookModal } from "./incoming-webhook-modal";
import { IncomingWebhooksPageSkeleton } from "./incoming-webhooks-page-skeleton";
import { useIncomingWebhookColumns } from "./use-incoming-webhook-columns";

type Props = {
  initialWebhooks: GetResult<IncomingWebhookDto>;
  lists: ReadonlyArray<{ id: string; label: string }>;
};

const IncomingWebhooksPageViewContent = observer(function IncomingWebhooksPageView({
  initialWebhooks,
  lists,
}: Props) {
  const { incomingWebhookModalStore, incomingWebhooksStore } = useRootStore();

  useDataViewSync(incomingWebhooksStore, initialWebhooks);
  const columns = useIncomingWebhookColumns(lists);
  const t = useTranslations();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const [logFor, setLogFor] = useState<IncomingWebhookDto | null>(null);
  const view = resolveDataViewView(incomingWebhooksStore.viewMode, incomingWebhooksStore.canBoard);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery:
      Boolean(incomingWebhooksStore.searchTerm?.trim()) || (incomingWebhooksStore.filters?.length ?? 0) > 0,
    isGrouped: incomingWebhooksStore.isGrouped,
    itemCount: incomingWebhooksStore.items.length,
    request: incomingWebhooksStore.dataRequest,
    total: incomingWebhooksStore.pagination?.total,
  });
  const descriptor = {
    title: t("IncomingWebhooks.emptyTitle"),
    body: lists.length === 0 ? t("IncomingWebhooks.noLists") : t("IncomingWebhooks.emptyBody"),
  };

  useEffect(() => incomingWebhookModalStore.configure([...lists]), [incomingWebhookModalStore, lists]);

  const canAdd = lists.length > 0;
  const handleAdd = useCallback(() => incomingWebhookModalStore.start(), [incomingWebhookModalStore]);
  const openWebhook = useCallback(
    (item: IncomingWebhookDto) => incomingWebhookModalStore.start(item),
    [incomingWebhookModalStore],
  );
  const canDelete = incomingWebhookModalStore.allows(Action.delete);
  const rowActions = useCallback(
    (item: IncomingWebhookDto) => (
      <RowActions
        contextAction={{ label: t("IncomingWebhooks.deliveries"), icon: Send, onSelect: () => setLogFor(item) }}
        name={item.name}
        onDelete={
          canDelete
            ? () => showDeleteConfirmation(() => incomingWebhookModalStore.deleteById(item.id), item.name)
            : undefined
        }
        onOpen={() => openWebhook(item)}
      />
    ),
    [canDelete, incomingWebhookModalStore, openWebhook, showDeleteConfirmation, t],
  );
  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        addLabel={pageState === "true-empty" && canAdd ? t("IncomingWebhooks.add") : undefined}
        anchorScope="settings-incoming-webhooks"
        searchLabel={t("Common.filters.searchFields.incomingWebhooks")}
        store={incomingWebhooksStore}
        onAdd={canAdd ? handleAdd : undefined}
      />
    ),
    [canAdd, handleAdd, incomingWebhooksStore, pageState, t],
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
              onClick={() => incomingWebhooksStore.setQueryOptions({ forceRefresh: true })}
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
          background={<IncomingWebhooksPageSkeleton view={view} />}
          label={t("PageState.loading")}
          state="loading"
        />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty descriptor={descriptor} reason="filtered" store={incomingWebhooksStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          actionLabel={canAdd ? t("IncomingWebhooks.add") : undefined}
          background={<IncomingWebhooksPageSkeleton animated={false} view={view} />}
          descriptor={descriptor}
          reason="true-empty"
          store={incomingWebhooksStore}
          onAdd={canAdd ? handleAdd : undefined}
        />
      );
      break;
    case "content":
      body = (
        <DataViewContent
          columns={columns}
          rowActions={rowActions}
          store={incomingWebhooksStore}
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
    <div id="incoming-webhooks">
      <DataViewLayout
        showPagination={pageState === "content" && view !== "board" && !incomingWebhooksStore.isGrouped}
        store={incomingWebhooksStore}
      >
        {body}
      </DataViewLayout>

      <IncomingWebhookModal />

      <IncomingWebhookDeliveries webhook={logFor} onClose={() => setLogFor(null)} />
    </div>
  );
});

export const IncomingWebhooksPageView = serverRenderedClient(IncomingWebhooksPageViewContent);
