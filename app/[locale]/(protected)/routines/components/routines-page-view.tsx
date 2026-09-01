"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { RoutineDto } from "@/ee/routines/routine.schema";

import { observer } from "mobx-react-lite";
import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
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
import { runUserAction } from "@/core/errors/report-application-error";

import { useRoutineColumns } from "./use-routine-columns";
import { RoutinesPageSkeleton } from "./routines-page-skeleton";

type Props = { initialRoutines: GetResult<RoutineDto> };

export const RoutinesPageView = observer(function RoutinesPageView({ initialRoutines }: Props) {
  const { routineModalStore, routinesStore } = useRootStore();
  const router = useRouter();

  useDataViewSync(routinesStore, initialRoutines);
  const columns = useRoutineColumns();
  const t = useTranslations();
  const view = resolveDataViewView(routinesStore.viewMode, routinesStore.groupingColumnId);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery: Boolean(routinesStore.searchTerm?.trim()) || (routinesStore.filters?.length ?? 0) > 0,
    itemCount: routinesStore.items.length,
    request: routinesStore.dataRequest,
    total: routinesStore.pagination?.total,
  });
  const descriptor = { title: t("RoutinesCard.emptyTitle"), body: t("RoutinesCard.emptyBody") };
  const handleAdd = useCallback(() => runUserAction(() => routineModalStore.openForCreate()), [routineModalStore]);
  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        addLabel={pageState === "true-empty" ? t("Common.actions.add") : undefined}
        anchorScope="routines"
        store={routinesStore}
        onAdd={handleAdd}
      />
    ),
    [handleAdd, pageState, t, routinesStore],
  );
  useSetTopBarActions(topBarNode);

  let body: ReactNode;
  switch (pageState) {
    case "error":
      body = (
        <PageState
          action={
            <Button size="sm" variant="secondary" onClick={() => routinesStore.setQueryOptions({ forceRefresh: true })}>
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
        <PageState background={<RoutinesPageSkeleton view={view} />} label={t("PageState.loading")} state="loading" />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty descriptor={descriptor} reason="filtered" store={routinesStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          actionLabel={t("Common.actions.add")}
          background={<RoutinesPageSkeleton animated={false} view={view} />}
          descriptor={descriptor}
          reason="true-empty"
          store={routinesStore}
          onAdd={handleAdd}
        />
      );
      break;
    case "content":
      body = (
        <DataViewContent
          columns={columns}
          store={routinesStore}
          view={view}
          onRowClick={(item) => router.push(`/routines/${item.id}`)}
        />
      );
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return (
    <DataViewLayout showPagination={pageState === "content" && view !== "board"} store={routinesStore}>
      {body}
    </DataViewLayout>
  );
});
