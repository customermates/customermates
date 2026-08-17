"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { TaskDto } from "@/features/tasks/task.schema";

import { observer } from "mobx-react-lite";
import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { DataViewContent } from "@/components/data-view/data-view-content";
import { DataViewEmpty } from "@/components/data-view/data-view-empty";
import { DataViewLayout } from "@/components/data-view/data-view-layout";
import { resolveDataViewPageState, resolveDataViewView } from "@/components/data-view/data-view-state";
import { DataViewToolbar } from "@/components/data-view/data-view-toolbar";
import { useDataViewSync } from "@/components/data-view/use-data-view-sync";
import { useEntityHref, useOpenEntity } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";

import { TasksPageSkeleton } from "./tasks-page-skeleton";
import { useTaskColumns } from "./use-task-columns";

type Props = { tasks: GetResult<TaskDto> };

export const TasksPageView = observer(function TasksPageView({ tasks }: Props) {
  const { tasksStore } = useRootStore();
  const openEntity = useOpenEntity();
  const entityHref = useEntityHref();
  const columns = useTaskColumns();
  const { singular } = useEntityTerminology();
  const t = useTranslations();

  useDataViewSync(tasksStore, tasks);

  const view = resolveDataViewView(tasksStore.viewMode, tasksStore.groupingColumnId);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery: Boolean(tasksStore.searchTerm?.trim()) || (tasksStore.filters?.length ?? 0) > 0,
    itemCount: tasksStore.items.length,
    request: tasksStore.dataRequest,
    total: tasksStore.pagination?.total,
  });
  const emptyActionLabel = t("Common.emptyState.cta", { singular: singular(EntityType.task) });
  const handleAdd = useCallback(() => openEntity(EntityType.task, "new"), [openEntity]);
  const rowHref = useCallback((task: TaskDto) => entityHref(EntityType.task, task.id), [entityHref]);
  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        addLabel={pageState === "true-empty" ? emptyActionLabel : undefined}
        anchorScope="tasks"
        store={tasksStore}
        onAdd={handleAdd}
      />
    ),
    [emptyActionLabel, handleAdd, pageState, tasksStore],
  );
  useSetTopBarActions(topBarNode);

  let body: ReactNode;
  switch (pageState) {
    case "error":
      body = (
        <PageState
          action={
            <Button size="sm" variant="outline" onClick={() => tasksStore.setQueryOptions({ forceRefresh: true })}>
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
        <PageState background={<TasksPageSkeleton view={view} />} label={t("PageState.loading")} state="loading" />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty reason="filtered" store={tasksStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          actionLabel={emptyActionLabel}
          background={<TasksPageSkeleton animated={false} view={view} />}
          reason="true-empty"
          store={tasksStore}
          onAdd={handleAdd}
        />
      );
      break;
    case "content":
      body = <DataViewContent columns={columns} rowHref={rowHref} store={tasksStore} view={view} />;
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return (
    <DataViewLayout showPagination={pageState === "content" && view !== "board"} store={tasksStore}>
      {body}
    </DataViewLayout>
  );
});
