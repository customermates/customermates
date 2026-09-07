"use client";

import type { ReactNode } from "react";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { AuditLogDto } from "@/features/audit-log/audit-log.dto";

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

import { AuditLogsPageSkeleton } from "./audit-logs-page-skeleton";
import { useAuditLogColumns } from "./use-audit-log-columns";

type Props = { initialAuditLogs: GetResult<AuditLogDto> };

export const AuditLogsPageView = observer(function AuditLogsPageView({ initialAuditLogs }: Props) {
  const { auditLogModalStore, auditLogsStore } = useRootStore();

  useDataViewSync(auditLogsStore, initialAuditLogs);
  const columns = useAuditLogColumns();
  const t = useTranslations();
  const view = resolveDataViewView(auditLogsStore.viewMode, auditLogsStore.canBoard);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery: Boolean(auditLogsStore.searchTerm?.trim()) || (auditLogsStore.filters?.length ?? 0) > 0,
    isGrouped: auditLogsStore.isGrouped,
    itemCount: auditLogsStore.items.length,
    request: auditLogsStore.dataRequest,
    total: auditLogsStore.pagination?.total,
  });
  const descriptor = { title: t("AuditLogsCard.emptyTitle"), body: t("AuditLogsCard.emptyBody") };
  const topBarNode = useMemo(
    () => (
      <DataViewToolbar
        anchorScope="company-audit-logs"
        searchPlaceholder={t("AuditLogsCard.searchTooltip")}
        store={auditLogsStore}
      />
    ),
    [auditLogsStore, t],
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
              onClick={() => auditLogsStore.setQueryOptions({ forceRefresh: true })}
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
        <PageState background={<AuditLogsPageSkeleton view={view} />} label={t("PageState.loading")} state="loading" />
      );
      break;
    case "filtered-empty":
      body = <DataViewEmpty descriptor={descriptor} reason="filtered" store={auditLogsStore} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          background={<AuditLogsPageSkeleton animated={false} view={view} />}
          descriptor={descriptor}
          reason="true-empty"
          store={auditLogsStore}
        />
      );
      break;
    case "content":
      body = (
        <DataViewContent
          columns={columns}
          store={auditLogsStore}
          view={view}
          onRowClick={(item) => {
            auditLogModalStore.onInitOrRefresh(item);
            auditLogModalStore.open();
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
      showPagination={pageState === "content" && view !== "board" && !auditLogsStore.isGrouped}
      store={auditLogsStore}
    >
      {body}
    </DataViewLayout>
  );
});
