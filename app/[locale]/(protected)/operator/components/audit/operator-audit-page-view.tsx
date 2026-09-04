"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { OperatorAuditRowDto } from "@/ee/operator/operator-lists.schema";

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

import { OperatorAuditPageSkeleton } from "./operator-audit-page-skeleton";
import { useOperatorAuditColumns } from "./use-operator-audit-columns";

type Props = { initialAudit: GetResult<OperatorAuditRowDto> };

export const OperatorAuditPageView = observer(function OperatorAuditPageView({ initialAudit }: Props) {
  const { operatorAuditStore } = useRootStore();

  useDataViewSync(operatorAuditStore, initialAudit);
  const columns = useOperatorAuditColumns();
  const t = useTranslations();
  const view = resolveDataViewView(operatorAuditStore.viewMode, operatorAuditStore.isGrouped);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery: Boolean(operatorAuditStore.searchTerm?.trim()) || (operatorAuditStore.filters?.length ?? 0) > 0,
    isGrouped: operatorAuditStore.isGrouped,
    itemCount: operatorAuditStore.items.length,
    request: operatorAuditStore.dataRequest,
    total: operatorAuditStore.pagination?.total,
  });
  const descriptor = { title: t("OperatorAudit.emptyTitle"), body: t("OperatorAudit.emptyBody") };
  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        anchorScope="operator-audit"
        searchPlaceholder={t("OperatorAudit.searchPlaceholder")}
        store={operatorAuditStore}
      />
    ),
    [operatorAuditStore, t],
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
              onClick={() => operatorAuditStore.setQueryOptions({ forceRefresh: true })}
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
          background={<OperatorAuditPageSkeleton view={view} />}
          label={t("PageState.loading")}
          state="loading"
        />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty descriptor={descriptor} reason="filtered" store={operatorAuditStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          background={<OperatorAuditPageSkeleton animated={false} view={view} />}
          descriptor={descriptor}
          reason="true-empty"
          store={operatorAuditStore}
        />
      );
      break;
    case "content":
      body = <DataViewContent columns={columns} store={operatorAuditStore} view={view} />;
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }
  return (
    <DataViewLayout
      showPagination={pageState === "content" && view !== "board" && !operatorAuditStore.isGrouped}
      store={operatorAuditStore}
    >
      {body}
    </DataViewLayout>
  );
});
