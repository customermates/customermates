"use client";

import type { ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { GetResult } from "@/core/base/base-get.interactor";

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

import { OperatorListSkeleton } from "./operator-list-skeleton";

type Props<T extends HasId> = {
  anchorScope: string;
  columns: ColumnDef<T>[];
  emptyBody: string;
  emptyTitle: string;
  initialData: GetResult<T>;
  searchPlaceholder: string;
  store: BaseDataViewStore<T>;
  onRowClick?: (item: T) => void;
};

function OperatorDataViewPageInner<T extends HasId>({
  anchorScope,
  columns,
  emptyBody,
  emptyTitle,
  initialData,
  searchPlaceholder,
  store,
  onRowClick,
}: Props<T>) {
  const t = useTranslations();

  useDataViewSync(store, initialData);

  const view = resolveDataViewView(store.viewMode, store.groupingColumnId);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery: Boolean(store.searchTerm?.trim()) || (store.filters?.length ?? 0) > 0,
    itemCount: store.items.length,
    request: store.dataRequest,
    total: store.pagination?.total,
  });
  const descriptor = { title: emptyTitle, body: emptyBody };
  const topBarNode = useMemo(
    () => <DataViewToolbar anchorScope={anchorScope} searchPlaceholder={searchPlaceholder} store={store} />,
    [anchorScope, searchPlaceholder, store],
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
      body = (
        <PageState background={<OperatorListSkeleton view={view} />} label={t("PageState.loading")} state="loading" />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty descriptor={descriptor} reason="filtered" store={store} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          background={<OperatorListSkeleton animated={false} view={view} />}
          descriptor={descriptor}
          reason="true-empty"
          store={store}
        />
      );
      break;
    case "content":
      body = <DataViewContent columns={columns} store={store} view={view} onRowClick={onRowClick} />;
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return (
    <DataViewLayout showPagination={pageState === "content" && view !== "board"} store={store}>
      {body}
    </DataViewLayout>
  );
}

export const OperatorDataViewPage = observer(OperatorDataViewPageInner) as typeof OperatorDataViewPageInner;
