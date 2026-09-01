"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { OperatorUserRowDto } from "@/ee/operator/operator-lists.schema";

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

import { OperatorUsersPageSkeleton } from "./operator-users-page-skeleton";
import { useOperatorUserColumns } from "./use-operator-user-columns";

type Props = { initialUsers: GetResult<OperatorUserRowDto> };

export const OperatorUsersPageView = observer(function OperatorUsersPageView({ initialUsers }: Props) {
  const { operatorUsersStore } = useRootStore();

  useDataViewSync(operatorUsersStore, initialUsers);
  const columns = useOperatorUserColumns();
  const t = useTranslations();
  const view = resolveDataViewView(operatorUsersStore.viewMode, operatorUsersStore.groupingColumnId);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery: Boolean(operatorUsersStore.searchTerm?.trim()) || (operatorUsersStore.filters?.length ?? 0) > 0,
    itemCount: operatorUsersStore.items.length,
    request: operatorUsersStore.dataRequest,
    total: operatorUsersStore.pagination?.total,
  });
  const descriptor = { title: t("OperatorUsers.emptyTitle"), body: t("OperatorUsers.emptyBody") };
  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        anchorScope="operator-users"
        searchPlaceholder={t("OperatorUsers.searchPlaceholder")}
        store={operatorUsersStore}
      />
    ),
    [operatorUsersStore, t],
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
              onClick={() => operatorUsersStore.setQueryOptions({ forceRefresh: true })}
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
          background={<OperatorUsersPageSkeleton view={view} />}
          label={t("PageState.loading")}
          state="loading"
        />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty descriptor={descriptor} reason="filtered" store={operatorUsersStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          background={<OperatorUsersPageSkeleton animated={false} view={view} />}
          descriptor={descriptor}
          reason="true-empty"
          store={operatorUsersStore}
        />
      );
      break;
    case "content":
      body = <DataViewContent columns={columns} store={operatorUsersStore} view={view} />;
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }
  return (
    <DataViewLayout showPagination={pageState === "content" && view !== "board"} store={operatorUsersStore}>
      {body}
    </DataViewLayout>
  );
});
