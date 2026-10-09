"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Settings2 } from "lucide-react";

import type { ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordRef } from "@/features/records/record-model.schema";

import { useRootStore } from "@/core/stores/root-store.provider";
import { TopBarActionButtons } from "@/components/shared/top-bar-action-buttons";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { DataViewContent } from "@/components/data-view/data-view-content";
import { DataViewLayout } from "@/components/data-view/data-view-layout";
import { DataViewToolbar } from "@/components/data-view/data-view-toolbar";
import { DataViewEmpty } from "@/components/data-view/data-view-empty";
import { resolveDataViewPageState, resolveDataViewView } from "@/components/data-view/data-view-state";
import { useDataViewSync } from "@/components/data-view/use-data-view-sync";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { RecordsStore } from "./records.store";
import { RecordsPageSkeleton } from "./records-page-skeleton";
import { RecordCell } from "./record-cell";
import { RecordCardContent } from "./record-chip-row";
import type { DataTableColumnStyle } from "@/components/data-view/data-table";
import type { DataViewGroup } from "@/core/base/grouping/grouping.schema";
import type { RecordFieldView } from "@/features/records/record-model.schema";

const NUMBER_TYPES: RecordFieldView["valueType"][] = ["number", "currency"];
const END_ALIGNED_TYPES: RecordFieldView["valueType"][] = [
  ...NUMBER_TYPES,
  "date",
  "dateTime",
  "dateRange",
  "dateTimeRange",
];
import {
  RecordCalculatedValue,
  RecordInlineField,
  RecordInlineRelationship,
  canEditInline,
  isCalculatedField,
  hasInlineRelationshipEditor,
} from "./record-inline-field";
import { RecordRowActions, recordRowName } from "./record-row-actions";
import { useRecordDeletion } from "./use-record-deletion";
import { useRecordRouteReady } from "@/components/records/use-record-route-ready";
import { RecordOperationProgress } from "@/components/records/record-operation-progress";
import { useRecordExport } from "@/features/data-transfer/export/use-record-export";
import { RecordImportDialog } from "./record-import-dialog";
import { RecordMassActions } from "./record-mass-actions";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

const RecordsPageViewContent = observer(function RecordsPageView({
  presentation,
}: {
  presentation: RecordPresentationResult;
}) {
  useRecordRouteReady();
  const root = useRootStore();
  const t = useTranslations();
  const [store] = useState(() => new RecordsStore(root, presentation));
  const [importOpen, setImportOpen] = useState(false);
  const applied = useRef(presentation);
  useEffect(() => {
    if (applied.current === presentation) return;
    applied.current = presentation;
    store.setPresentation(presentation);
  }, [presentation, store]);
  useDataViewSync(store, presentation.result);
  useEffect(
    () =>
      root.recordWorkspaceStore.subscribe(async () => {
        await store.refresh();
      }),
    [root, store],
  );
  useEffect(() => {
    const key = `records:${presentation.typeId}`;
    root.layoutStore.setRuntimeIdentity({
      scope: "entity",
      key,
      title: store.type?.pluralLabel ?? t("RecordModel.records"),
      pictureUrl: null,
      avatarKind: null,
    });
    return () => root.layoutStore.clearRuntimeIdentity("entity", key);
  }, [root, presentation.typeId, store.type?.pluralLabel, t]);
  const openEditor = useCallback(
    (
      ref: { typeId: string; recordId?: string; values?: Record<string, unknown> },
      returnFocusTo?: HTMLElement | null,
    ) => {
      const target = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      root.recordWorkspaceStore.open(ref, returnFocusTo ?? target);
    },
    [root],
  );
  const openRelated = useCallback((ref: RecordRef) => openEditor(ref), [openEditor]);
  const openRecord = useCallback(
    (record: RecordRow, returnFocusTo?: HTMLElement | null) => openEditor(record.ref, returnFocusTo),
    [openEditor],
  );
  const recordHref = useCallback((record: RecordRow) => `/records/${record.ref.typeId}/${record.ref.recordId}`, []);
  const recordColumns = store.recordColumns;
  const avatarFieldId = store.presentation.model.capabilities
    .find((binding) => binding.kind === "avatar" && binding.typeId === store.presentation.typeId)
    ?.fields.find((field) => field.role === "image")?.fieldId;
  const view = resolveDataViewView(store.viewMode, store.canBoard);
  const columnHeaders = JSON.stringify(recordColumns.map((column) => [column.id, column.label]));
  const columns = useMemo<ColumnDef<RecordRow>[]>(
    () =>
      (JSON.parse(columnHeaders) as [string, string][]).map(([id, header]) => ({
        id,
        header,
        cell: ({ row }) => {
          const column = store.recordColumns.find((candidate) => candidate.id === id);
          if (!column) return null;
          const renderCell = (inTrigger: boolean) => (
            <RecordCell
              avatarFieldId={column.id === store.type?.primaryFieldId ? avatarFieldId : undefined}
              column={column}
              inTrigger={inTrigger}
              linkColors={store.presentation.linkColors}
              linkIcons={store.presentation.linkIcons}
              record={row.original}
              onMore={() => openRecord(row.original)}
              onOpen={openRelated}
            />
          );
          if (column.kind === "relationship" && hasInlineRelationshipEditor(store, row.original, column.relation)) {
            const summary = row.original.relationships.find(
              (entry) => entry.relationId === column.relation.id && entry.direction === column.direction,
            );
            return (
              <RecordInlineRelationship
                direction={column.direction}
                empty={!summary?.records.length}
                label={column.label}
                record={row.original}
                records={store}
                relation={column.relation}
                onOpenRecord={openRelated}
              >
                {renderCell(true)}
              </RecordInlineRelationship>
            );
          }
          if (column.kind !== "field") return renderCell(false);
          if (canEditInline(store, row.original, column.field)) {
            return (
              <RecordInlineField field={column.field} record={row.original} records={store}>
                {renderCell(true)}
              </RecordInlineField>
            );
          }
          return isCalculatedField(store, column.field) ? (
            <RecordCalculatedValue field={column.field} model={store.presentation.model}>
              {renderCell(false)}
            </RecordCalculatedValue>
          ) : (
            renderCell(false)
          );
        },
      })),
    [columnHeaders, openRelated, openRecord, avatarFieldId, store],
  );
  const columnStyle = useCallback(
    (columnId: string): DataTableColumnStyle => {
      const column = store.recordColumns.find((candidate) => candidate.id === columnId);
      const firstNumber = store.visibleColumns
        .map((visible) => store.recordColumns.find((candidate) => candidate.id === visible.uid))
        .find((candidate) => candidate?.kind === "field" && NUMBER_TYPES.includes(candidate.field.valueType));
      const endAligned =
        (column?.kind === "field" && END_ALIGNED_TYPES.includes(column.field.valueType)) ||
        columnId === "system:createdAt" ||
        columnId === "system:updatedAt";
      return {
        align: endAligned ? "end" : undefined,
        emphasis: columnId === store.primaryColumnId || column === firstNumber,
      };
    },
    [store],
  );
  const addToGroup = useCallback(
    (group: DataViewGroup) => {
      const fieldId = store.groupingResult?.columnId;
      if (!fieldId) return;
      openEditor({
        typeId: store.presentation.typeId,
        values: { [fieldId]: group.key.startsWith("value:") ? group.key.slice("value:".length) : undefined },
      });
    },
    [openEditor, store],
  );
  const renderCard = useCallback(
    (record: RecordRow) => {
      const primary = store.recordColumns.find((column) => column.id === store.primaryColumnId);
      return (
        <RecordCardContent
          record={record}
          records={store}
          title={
            primary && (
              <RecordCell
                avatarFieldId={avatarFieldId}
                column={primary}
                linkColors={store.presentation.linkColors}
                linkIcons={store.presentation.linkIcons}
                record={record}
                onOpen={openRelated}
              />
            )
          }
          onOpenRecord={openRelated}
        />
      );
    },
    [avatarFieldId, openRelated, store],
  );
  const deletion = useRecordDeletion({
    onDeleted: () => root.recordWorkspaceStore.invalidate(),
    onPending: (operationId) => store.setBulkState(false, operationId),
  });
  const rowActions = useCallback(
    (record: RecordRow) => {
      const name = recordRowName(store, record);
      const canDelete = store.presentation.permittedActions.includes("delete") && !record.protectedKind;
      return (
        <RecordRowActions
          name={name}
          onDelete={
            canDelete ? () => deletion.requestDeletion(record, store.presentation.model.revision, name) : undefined
          }
          onOpen={(returnFocusTo) => openRecord(record, returnFocusTo)}
        />
      );
    },
    [deletion, store, openRecord],
  );
  const handleAdd = useCallback(() => openEditor({ typeId: store.presentation.typeId }), [openEditor, store]);
  const handleExport = useRecordExport(store.presentation);
  const handleImport = useCallback(() => setImportOpen(true), []);
  const configureLabel = t("RecordModel.configure");
  const toolbar = useMemo(
    () => (
      <DataViewToolbar
        actions={
          store.presentation.canManageSchema && (
            <TopBarActionButtons
              actions={[
                {
                  id: "configure",
                  anchorId: "records-configure",
                  href: `/configure?typeId=${presentation.typeId}`,
                  icon: Settings2,
                  label: configureLabel,
                },
              ]}
            />
          )
        }
        anchorScope="records"
        store={store}
        onAdd={handleAdd}
        onExport={handleExport}
        onImport={handleImport}
      />
    ),
    [
      store,
      store.presentation.canManageSchema,
      handleAdd,
      handleExport,
      handleImport,
      presentation.typeId,
      configureLabel,
    ],
  );
  useSetTopBarActions(toolbar);
  const pageState = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery: Boolean(store.searchTerm?.trim()) || Boolean(store.filters?.length),
    isGrouped: store.isGrouped,
    itemCount: store.items.length,
    request: store.dataRequest,
    total: store.pagination?.total,
  });
  let body: ReactNode;
  switch (pageState) {
    case "loading":
      body = (
        <PageState background={<RecordsPageSkeleton view={view} />} label={t("PageState.loading")} state="loading" />
      );
      break;
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
    case "filtered-empty":
      body = <DataViewEmpty reason="filtered" store={store} />;
      break;
    case "true-empty":
      body = (
        <DataViewEmpty
          background={<RecordsPageSkeleton animated={false} view={view} />}
          descriptor={{
            title: t("RecordModel.empty", {
              type: store.type?.pluralLabel ?? t("RecordModel.records"),
            }),
            body: t("RecordModel.emptyDescription"),
          }}
          reason="true-empty"
          store={store}
          onAdd={handleAdd}
        />
      );
      break;
    case "content":
      body = (
        <DataViewContent
          columnStyle={columnStyle}
          columns={columns}
          renderCard={renderCard}
          rowActions={rowActions}
          rowHref={recordHref}
          store={store}
          view={view}
          onAddToGroup={store.presentation.permittedActions.includes("create") ? addToGroup : undefined}
        />
      );
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }
  return (
    <>
      <DataViewLayout showPagination={pageState === "content" && view !== "board" && !store.isGrouped} store={store}>
        <RecordMassActions store={store} />

        {store.pendingBulkOperation && (
          <RecordOperationProgress
            operationId={store.pendingBulkOperation}
            onCompleted={store.bulkCompleted}
            onStopped={store.bulkStopped}
          />
        )}

        {store.pendingBoardOperation && (
          <RecordOperationProgress
            operationId={store.pendingBoardOperation}
            onCompleted={store.boardOperationCompleted}
            onStopped={store.boardOperationStopped}
          />
        )}

        {body}
      </DataViewLayout>

      <RecordImportDialog
        open={importOpen}
        schemaRevision={store.presentation.model.revision}
        typeId={presentation.typeId}
        onImported={() => root.recordWorkspaceStore.invalidate()}
        onOpenChange={setImportOpen}
      />
    </>
  );
});

export const RecordsPageView = serverRenderedClient(RecordsPageViewContent);
