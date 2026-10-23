"use client";

import type { ReactNode } from "react";
import type { Filter } from "@/core/base/base-get.schema";
import type { AppModalActionProps } from "@/components/modal/app-modal-action";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordRef } from "@/features/records/record-model.schema";

import { useCallback, useEffect, useState } from "react";
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
import { recordListHref } from "@/features/records/record-list-href";
import { getRecordPresentationAction } from "@/app/[locale]/(protected)/records/actions";
import { RecordExplorationStore } from "@/app/[locale]/(protected)/records/[typeId]/components/record-exploration.store";
import {
  useRecordCardRenderer,
  useRecordTableColumns,
} from "@/app/[locale]/(protected)/records/[typeId]/components/record-table-columns";

const ScopedRecordsTable = observer(function ScopedRecordsTable({
  store,
  emptyTitle,
  onOpen,
}: {
  store: RecordExplorationStore;
  emptyTitle: string;
  onOpen: (ref: RecordRef, opener?: HTMLElement | null) => void;
}) {
  const t = useTranslations();
  const root = useRootStore();
  useEffect(() => root.recordWorkspaceStore.subscribe(() => store.refresh()), [root, store]);
  const openRecord = useCallback(
    (record: RecordRow, opener?: HTMLElement | null) => onOpen(record.ref, opener),
    [onOpen],
  );
  const openRelated = useCallback((ref: RecordRef) => onOpen(ref), [onOpen]);
  const columns = useRecordTableColumns(store, openRelated, { openRecord });
  const renderCard = useRecordCardRenderer(store, openRelated);
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
          <PageState state="empty" title={emptyTitle} />
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

export type ScopedRecordsSheetProps = {
  open: boolean;
  title: string;
  summary: (store: RecordExplorationStore | null) => ReactNode;
  typeId: string;
  filter: Filter | null;
  emptyTitle: string;
  idPrefix: string;
  opener: HTMLElement | null;
  fallback?: HTMLElement | null;
  lead?: ReactNode;
  actions?: AppModalActionProps[];
  closeOnOpen?: boolean;
  onClose: () => void;
};

export const ScopedRecordsSheet = observer(function ScopedRecordsSheet({
  open: isOpen,
  title,
  summary,
  typeId,
  filter,
  emptyTitle,
  idPrefix,
  opener,
  fallback,
  lead,
  actions = [],
  closeOnOpen = false,
  onClose,
}: ScopedRecordsSheetProps) {
  const root = useRootStore();
  const t = useTranslations();
  const [store, setStore] = useState<{ filter: Filter; store: RecordExplorationStore } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError(!filter);
    if (!filter) return;
    actionData(
      getRecordPresentationAction(typeId, {
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
        if (active) setStore({ filter, store: new RecordExplorationStore(root, data, [filter]) });
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
  }, [filter, root, typeId, attempt]);
  const current = store && store.filter === filter ? store.store : null;
  const open = useCallback(
    (ref: RecordRef, trigger?: HTMLElement | null) => {
      if (closeOnOpen) onClose();
      return root.recordWorkspaceStore.open(ref, closeOnOpen ? opener : (trigger ?? opener));
    },
    [closeOnOpen, onClose, root, opener],
  );
  const listHref =
    filter && recordListHref(typeId, [filter, ...(current?.filters ?? [])], { searchTerm: current?.searchTerm });
  return (
    <AppModal
      sheet
      titleInContent
      actions={[
        ...actions,
        ...(listHref
          ? [
              {
                id: "open-list",
                kind: "navigate" as const,
                icon: ArrowUpRight,
                label: t("RecordModel.openList"),
                href: listHref,
                onNavigate: onClose,
              },
            ]
          : []),
      ]}
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      controls={
        current
          ? {
              slots: 2,
              node: (
                <>
                  <FilterPopover
                    compact
                    id={`${idPrefix}-filter`}
                    searchLabel={t("Common.filters.searchFields.records")}
                    store={current}
                  />

                  <DataViewDisplayOptions
                    compact
                    active={current.hasLayoutChanges}
                    anchorScope={idPrefix}
                    id={`${idPrefix}-display-options`}
                    store={current}
                  />
                </>
              ),
            }
          : undefined
      }
      focusReturnFallback={fallback}
      focusReturnTarget={opener}
      open={isOpen}
      title={title}
      onClose={onClose}
    >
      <AppCardHeader className="flex-col items-start gap-1 pb-4">
        <AppModalTitle className="w-full truncate text-lg font-semibold">{title}</AppModalTitle>

        <p className="w-full truncate text-sm text-muted-foreground" data-linked-records-summary="">
          {summary(current)}
        </p>
      </AppCardHeader>

      {lead}

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
      ) : current ? (
        <ScopedRecordsTable emptyTitle={emptyTitle} store={current} onOpen={open} />
      ) : (
        <div aria-label={t("Loading.text")} className="space-y-3 px-6 py-3" role="status">
          <Skeleton className="h-9" />

          <Skeleton className="h-48" />
        </div>
      )}
    </AppModal>
  );
});
