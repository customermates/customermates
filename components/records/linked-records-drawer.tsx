"use client";

import type { LinkedRecordsSelection } from "@/core/stores/record-workspace.store";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordRef } from "@/features/records/record-model.schema";

import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";

import { AppModal, AppModalTitle } from "@/components/modal/app-modal";
import { DataViewContent } from "@/components/data-view/data-view-content";
import { FilterPopover } from "@/components/data-view/header/filter-popover";
import { DataViewDisplayOptions } from "@/components/data-view/header/display-options";
import { AppCardHeader } from "@/components/card/app-card-header";
import { DataViewPagination } from "@/components/data-view/header/pagination";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRootStore } from "@/core/stores/root-store.provider";
import { ViewMode } from "@/core/base/base-query-builder";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { actionData } from "@/core/utils/action-data";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { recordDisplayName } from "@/features/records/record-display-name";
import { linkedRecordsFilter, linkedRecordsHref } from "@/features/records/linked-records-link";
import { getRecordPresentationAction } from "@/app/[locale]/(protected)/w/[workspace]/records/actions";
import { RecordExplorationStore } from "@/app/[locale]/(protected)/w/[workspace]/records/[typeId]/components/record-exploration.store";
import {
  useRecordCardRenderer,
  useRecordTableColumns,
} from "@/app/[locale]/(protected)/w/[workspace]/records/[typeId]/components/record-table-columns";

const LinkedRecordsTable = observer(function LinkedRecordsTable({
  store,
  onOpen,
}: {
  store: RecordExplorationStore;
  onOpen: (ref: RecordRef) => void;
}) {
  const t = useTranslations();
  const root = useRootStore();
  useEffect(() => root.recordWorkspaceStore.subscribe(() => store.refresh()), [root, store]);
  const openRecord = useCallback((record: RecordRow) => onOpen(record.ref), [onOpen]);
  const columns = useRecordTableColumns(store, onOpen, { openRecord });
  const renderCard = useRecordCardRenderer(store, onOpen);
  const name = (record: RecordRow) =>
    recordDisplayName(
      record.fields.find((field) => field.fieldId === store.type?.primaryFieldId)?.result,
      store.type?.label,
      t,
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col border-t" data-linked-records="">
      <div
        className="relative min-h-44 flex-1 overflow-auto sm:overflow-hidden *:data-[slot=table-container]:h-full *:data-[slot=table-container]:overflow-auto [&_:is(th,td):first-child]:pl-6 [&_:is(th,td):last-child]:pr-6 [&_li[data-row-id]]:px-6"
        data-linked-records-table=""
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
          <PageState state="empty" title={t("RecordModel.noLinkedRecords")} />
        ) : (
          <DataViewContent
            columns={columns}
            renderCard={renderCard}
            rowHref={(record) => `/records/${record.ref.typeId}/${record.ref.recordId}`}
            rowLabel={name}
            store={store}
            view="table"
            onRowClick={openRecord}
          />
        )}
      </div>

      <DataViewPagination className="px-6" store={store} />
    </div>
  );
});

export const LinkedRecordsDrawer = observer(function LinkedRecordsDrawer({
  selection,
  open: isOpen,
  onClose,
}: {
  selection: LinkedRecordsSelection;
  open: boolean;
  onClose: () => void;
}) {
  const root = useRootStore();
  const t = useTranslations();
  const { source, link, targetTypeId } = selection;
  const filter = useMemo(() => linkedRecordsFilter(source, link), [source, link]);
  const [store, setStore] = useState<RecordExplorationStore | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError(false);
    actionData(
      getRecordPresentationAction(targetTypeId, {
        filters: [filter],
        searchTerm: "",
        viewMode: ViewMode.table,
        grouping: null,
        page: 1,
        pageSize: 10,
        viewId: ALL_VIEW_KEY,
      }),
    )
      .then((data) => {
        if (active) setStore(new RecordExplorationStore(root, data, [filter]));
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(true);
          reportApplicationError(cause);
        }
      });
    return () => {
      active = false;
    };
  }, [filter, root, targetTypeId, attempt]);
  const open = useCallback(
    (ref: RecordRef) => {
      onClose();
      return root.recordWorkspaceStore.open(ref, selection.opener);
    },
    [onClose, root, selection.opener],
  );
  return (
    <AppModal
      sheet
      titleInContent
      actions={[
        {
          id: "open-list",
          kind: "navigate",
          icon: ArrowUpRight,
          label: t("RecordModel.openList"),
          href: linkedRecordsHref(targetTypeId, [filter, ...(store?.filters ?? [])], store?.searchTerm),
          onNavigate: onClose,
        },
      ]}
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      controls={
        store
          ? {
              slots: 2,
              node: (
                <>
                  <FilterPopover
                    compact
                    id="linked-records-filter"
                    searchLabel={t("Common.filters.searchFields.records")}
                    store={store}
                  />

                  <DataViewDisplayOptions
                    compact
                    active={store.hasLayoutChanges}
                    anchorScope="linked-records"
                    id="linked-records-display-options"
                    store={store}
                  />
                </>
              ),
            }
          : undefined
      }
      focusReturnFallback={selection.fallback}
      focusReturnTarget={selection.opener}
      open={isOpen}
      title={selection.label}
      onClose={onClose}
    >
      <AppCardHeader className="flex-col items-start gap-1 pb-4">
        <AppModalTitle className="w-full truncate text-lg font-semibold">{selection.label}</AppModalTitle>

        <p className="w-full truncate text-sm text-muted-foreground" data-linked-records-summary="">
          {store
            ? t("RecordModel.linkedRecordsSummary", {
                count: store.pagination?.total ?? store.items.length,
                name: selection.sourceName,
              })
            : selection.sourceName}
        </p>
      </AppCardHeader>

      {error ? (
        <PageState
          action={
            <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
              {t("ErrorCard.retry")}
            </Button>
          }
          state="error"
          title={t("ErrorCard.title")}
        />
      ) : store ? (
        <LinkedRecordsTable store={store} onOpen={open} />
      ) : (
        <div aria-label={t("Loading.text")} className="space-y-3 px-4 py-3" role="status">
          <Skeleton className="h-9" />

          <Skeleton className="h-48" />
        </div>
      )}
    </AppModal>
  );
});
