"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { TrashItemDto } from "@/features/trash/trash.schema";

import { observer } from "mobx-react-lite";
import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw, Trash2 } from "lucide-react";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { DataViewContent } from "@/components/data-view/data-view-content";
import { DataViewEmpty } from "@/components/data-view/data-view-empty";
import { DataViewLayout } from "@/components/data-view/data-view-layout";
import { DataViewSelectionBar } from "@/components/data-view/data-view-selection-bar";
import { resolveDataViewPageState } from "@/components/data-view/data-view-state";
import { DataViewToolbar } from "@/components/data-view/data-view-toolbar";
import { useDataViewSync } from "@/components/data-view/use-data-view-sync";
import { PageState } from "@/components/page-state/page-state";
import { RecordOperationProgress } from "@/components/records/record-operation-progress";
import { TopBarActionButtons } from "@/components/shared/top-bar-action-buttons";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { useRouter } from "@/i18n/navigation";
import { RecordRowActions } from "@/app/[locale]/(protected)/records/[typeId]/components/record-row-actions";

import { useFocusTarget } from "@/components/focus/focus-target";
import { focusKey, type FocusKind } from "@/components/focus/focus-href";

import { TrashPageSkeleton } from "./trash-page-skeleton";
import { useTrashColumns } from "./use-trash-columns";

type Props = { initialTrash: GetResult<TrashItemDto> };

const TRASH_FOCUS_KINDS = ["list", "field", "relationship", "view", "widget", "routine", "record"] as const;
const trashFocusKey = (item: TrashItemDto) =>
  (TRASH_FOCUS_KINDS as readonly string[]).includes(item.kind)
    ? focusKey({ kind: item.kind as FocusKind, id: item.targetId })
    : undefined;

const recordHref = (item: TrashItemDto) =>
  item.kind === "record" && item.typeId ? `/records/${item.typeId}/${item.targetId}` : undefined;

const TrashPageViewContent = observer(function TrashPageView({ initialTrash }: Props) {
  const { trashStore: store } = useRootStore();
  const t = useTranslations();
  const router = useRouter();
  useDataViewSync(store, initialTrash);
  const columns = useTrashColumns();
  const openItem = useCallback(
    (item: TrashItemDto) => {
      const href = recordHref(item);
      if (href) router.push(href);
    },
    [router],
  );
  const rowActions = useCallback(
    (item: TrashItemDto) => (
      <RecordRowActions
        contextAction={{
          icon: RotateCcw,
          label: t("Trash.restore"),
          onSelect: () => runUserAction(() => store.restoreItems([item.id])),
        }}
        deleteLabel={t("Trash.deletePermanently")}
        name={item.label}
        onDelete={() => store.requestPermanentDelete([item.id], item.label)}
        onOpen={recordHref(item) ? () => openItem(item) : undefined}
      />
    ),
    [openItem, store, t],
  );
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery: Boolean(store.searchTerm?.trim()) || (store.filters?.length ?? 0) > 0,
    isGrouped: false,
    itemCount: store.items.length,
    request: store.dataRequest,
    total: store.pagination?.total,
  });
  useFocusTarget(
    TRASH_FOCUS_KINDS,
    (target) => store.items.some((item) => item.targetId === target.id),
    pageState !== "loading",
  );
  const descriptor = { title: t("Trash.emptyTitleState"), body: t("Trash.emptyBody") };
  const canEmpty = store.canEmpty && pageState === "content";
  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        actions={
          canEmpty ? (
            <TopBarActionButtons
              actions={[
                {
                  id: "empty-trash",
                  anchorId: "trash-empty",
                  icon: Trash2,
                  kind: "destructive",
                  label: t("Trash.empty"),
                  variant: "destructive",
                  onClick: () => store.requestEmpty(),
                },
              ]}
            />
          ) : undefined
        }
        anchorScope="trash"
        searchPlaceholder={t("Trash.searchPlaceholder")}
        showDisplayOptions={false}
        store={store}
      />
    ),
    [canEmpty, store, t],
  );
  useSetTopBarActions(topBarNode);

  let body: ReactNode;
  switch (pageState) {
    case "error":
      body = (
        <PageState
          action={
            <Button size="sm" variant="secondary" onClick={() => store.setQueryOptions({ forceRefresh: true })}>
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
      body = <PageState background={<TrashPageSkeleton />} label={t("PageState.loading")} state="loading" />;
      break;
    case "filtered-empty":
      body = <DataViewEmpty descriptor={descriptor} reason="filtered" store={store} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          background={<TrashPageSkeleton animated={false} />}
          descriptor={descriptor}
          reason="true-empty"
          store={store}
        />
      );
      break;
    case "content":
      body = (
        <DataViewContent
          columns={columns}
          rowActions={rowActions}
          rowFocusKey={trashFocusKey}
          rowHref={recordHref}
          store={store}
          view="table"
        />
      );
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return (
    <DataViewLayout showPagination={pageState === "content"} store={store}>
      <DataViewSelectionBar busy={store.isMutating} data-trash-mass-actions="" store={store}>
        <Button
          disabled={store.isMutating}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => runUserAction(() => store.restoreItems(store.selectedItemIds))}
        >
          <RotateCcw className="size-4" />

          {t("Trash.restore")}
        </Button>

        <Button
          disabled={store.isMutating}
          size="sm"
          type="button"
          variant="destructiveOutline"
          onClick={() => runUserAction(() => store.requestPermanentDelete(store.selectedItemIds))}
        >
          <Trash2 className="size-4" />

          {t("Trash.deletePermanently")}
        </Button>
      </DataViewSelectionBar>

      {store.pendingRestoreOperation && (
        <RecordOperationProgress
          operationId={store.pendingRestoreOperation}
          onCompleted={store.restoreOperationCompleted}
          onStopped={store.restoreOperationStopped}
        />
      )}

      {body}
    </DataViewLayout>
  );
});

export const TrashPageView = serverRenderedClient(TrashPageViewContent);
