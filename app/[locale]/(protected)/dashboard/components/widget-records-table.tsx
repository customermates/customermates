"use client";

import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";
import type { RecordRow } from "@/features/records/record-presentation";

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";

import { DataViewContent } from "@/components/data-view/data-view-content";
import { DataViewToolbar } from "@/components/data-view/data-view-toolbar";
import { DataViewPagination } from "@/components/data-view/header/pagination";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { recordDisplayName } from "@/features/records/record-display-name";
import { recordContributionHref } from "@/features/records/record-contribution-link";
import { IntlLink } from "@/i18n/navigation";
import { RecordExplorationStore } from "../../records/[typeId]/components/record-exploration.store";
import { useRecordCardRenderer, useRecordTableColumns } from "../../records/[typeId]/components/record-table-columns";

export const WidgetRecordsTable = observer(function WidgetRecordsTable({
  presentation,
}: {
  presentation: RecordPresentationResult;
}) {
  const t = useTranslations();
  const root = useRootStore();
  const [store] = useState(() => new RecordExplorationStore(root, presentation));
  useEffect(() => root.recordWorkspaceStore.subscribe(() => store.refresh()), [root, store]);
  const open = useCallback(
    (record: RecordRow, opener?: HTMLElement | null) => root.recordWorkspaceStore.open(record.ref, opener),
    [root],
  );
  const openRelated = useCallback((ref: RecordRow["ref"]) => root.recordWorkspaceStore.open(ref), [root]);
  const columns = useRecordTableColumns(store, openRelated, { openRecord: open });
  const renderCard = useRecordCardRenderer(store, openRelated);
  const listHref = recordContributionHref(presentation.typeId, store.filters ?? [], {
    searchTerm: store.searchTerm,
    sortDescriptor: store.sortDescriptor,
  });
  const name = (record: RecordRow) =>
    recordDisplayName(
      record.fields.find((field) => field.fieldId === store.type?.primaryFieldId)?.result,
      store.type?.label,
      t,
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-widget-records="">
      <div className="flex flex-wrap items-center justify-between gap-2 border-y px-4 py-3">
        <h3 className="text-sm font-medium">
          {t("RecordWidgets.contributingCount", { count: store.pagination?.total ?? store.items.length })}
        </h3>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {listHref && (
            <Button asChild size="sm" variant="ghost">
              <IntlLink href={listHref}>
                <ArrowUpRight aria-hidden className="size-4" />

                {t("RecordWidgets.openInList", { list: store.type?.pluralLabel ?? t("RecordModel.records") })}
              </IntlLink>
            </Button>
          )}

          <DataViewToolbar
            anchorScope="widget-data"
            searchLabel={t("Common.filters.searchFields.records")}
            store={store}
          />
        </div>
      </div>

      <div
        className="relative min-h-44 flex-1 overflow-auto sm:overflow-hidden *:data-[slot=table-container]:h-full *:data-[slot=table-container]:overflow-auto"
        data-widget-data-table=""
      >
        {store.dataRequest.status === "refresh-error" ? (
          <PageState
            action={
              <Button variant="secondary" onClick={() => runUserAction(() => store.refresh())}>
                {t("ErrorCard.retry")}
              </Button>
            }
            state="error"
            title={t("ErrorCard.title")}
          />
        ) : store.items.length === 0 ? (
          <PageState state="empty" title={t("Diagrams.noData")} />
        ) : (
          <DataViewContent
            columns={columns}
            renderCard={renderCard}
            rowHref={(record) => `/records/${record.ref.typeId}/${record.ref.recordId}`}
            rowLabel={name}
            store={store}
            view="table"
            onRowClick={open}
          />
        )}
      </div>

      <DataViewPagination store={store} />
    </div>
  );
});
