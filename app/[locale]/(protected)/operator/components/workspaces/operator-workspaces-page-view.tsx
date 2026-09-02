"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";

import { observer } from "mobx-react-lite";
import { useMemo, useState } from "react";
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

import { OperatorWorkspaceModal } from "./operator-workspace-modal";
import { OperatorWorkspacesPageSkeleton } from "./operator-workspaces-page-skeleton";
import { useOperatorWorkspaceColumns } from "./use-operator-workspace-columns";

type Props = { initialWorkspaces: GetResult<OperatorWorkspaceRowDto> };

export const OperatorWorkspacesPageView = observer(function OperatorWorkspacesPageView({ initialWorkspaces }: Props) {
  const { operatorWorkspacesStore } = useRootStore();
  const [selected, setSelected] = useState<OperatorWorkspaceRowDto | null>(null);

  useDataViewSync(operatorWorkspacesStore, initialWorkspaces);
  const columns = useOperatorWorkspaceColumns();
  const t = useTranslations();
  const view = resolveDataViewView(operatorWorkspacesStore.viewMode, operatorWorkspacesStore.groupingColumnId);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery:
      Boolean(operatorWorkspacesStore.searchTerm?.trim()) || (operatorWorkspacesStore.filters?.length ?? 0) > 0,
    itemCount: operatorWorkspacesStore.items.length,
    request: operatorWorkspacesStore.dataRequest,
    total: operatorWorkspacesStore.pagination?.total,
  });
  const descriptor = { title: t("OperatorWorkspaces.emptyTitle"), body: t("OperatorWorkspaces.emptyBody") };
  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        anchorScope="operator-workspaces"
        searchPlaceholder={t("OperatorWorkspaces.searchPlaceholder")}
        store={operatorWorkspacesStore}
      />
    ),
    [operatorWorkspacesStore, t],
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
              onClick={() => operatorWorkspacesStore.setQueryOptions({ forceRefresh: true })}
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
          background={<OperatorWorkspacesPageSkeleton view={view} />}
          label={t("PageState.loading")}
          state="loading"
        />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty descriptor={descriptor} reason="filtered" store={operatorWorkspacesStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          background={<OperatorWorkspacesPageSkeleton animated={false} view={view} />}
          descriptor={descriptor}
          reason="true-empty"
          store={operatorWorkspacesStore}
        />
      );
      break;
    case "content":
      body = (
        <DataViewContent
          columns={columns}
          store={operatorWorkspacesStore}
          view={view}
          onRowClick={(item) => setSelected(item)}
        />
      );
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }
  const current = selected ? (operatorWorkspacesStore.items.find((item) => item.id === selected.id) ?? null) : null;

  return (
    <DataViewLayout showPagination={pageState === "content" && view !== "board"} store={operatorWorkspacesStore}>
      {body}

      <OperatorWorkspaceModal workspace={current} onClose={() => setSelected(null)} />
    </DataViewLayout>
  );
});
