"use client";

import { runUserAction } from "@/core/errors/report-application-error";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordRef } from "@/features/records/record-model.schema";

import { useRootStore } from "@/core/stores/root-store.provider";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { DataViewContent } from "@/components/data-view/data-view-content";
import { DataViewLayout } from "@/components/data-view/data-view-layout";
import { DataViewToolbar } from "@/components/data-view/data-view-toolbar";
import { DataViewEmpty } from "@/components/data-view/data-view-empty";
import { resolveDataViewPageState, resolveDataViewView } from "@/components/data-view/data-view-state";
import { useDataViewSync } from "@/components/data-view/use-data-view-sync";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { IntlLink } from "@/i18n/navigation";
import { RecordsStore } from "./records.store";
import { RecordsPageSkeleton } from "./records-page-skeleton";
import { RecordCell } from "./record-cell";
import { getRecordEditorAction } from "../../actions";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { RecordEditorStore } from "./record-editor.store";
import { RecordEditor } from "./record-editor";
import { useRecordRouteReady } from "@/components/records/use-record-route-ready";
import { RecordOperationProgress } from "@/components/records/record-operation-progress";
import { useRecordExport } from "@/features/data-transfer/export/use-record-export";
import { RecordImportDialog } from "./record-import-dialog";

export const RecordsPageView = observer(function RecordsPageView({
  presentation,
}: {
  presentation: RecordPresentationResult;
}) {
  useRecordRouteReady();
  const root = useRootStore();
  const t = useTranslations();
  const [store] = useState(() => new RecordsStore(root, presentation));
  const [importOpen, setImportOpen] = useState(false);
  const [editor] = useState(
    () =>
      new RecordEditorStore(root, presentation, async () => {
        await store.refresh();
      }),
  );
  const applied = useRef(presentation);
  const opening = useRef(0);
  if (applied.current !== presentation) {
    applied.current = presentation;
    store.setPresentation(presentation);
  }
  useDataViewSync(store, presentation.result);
  useEffect(
    () =>
      root.recordWorkspaceStore.subscribe(async () => {
        await store.refresh();
      }),
    [root, store],
  );
  useEffect(() => {
    root.registerModalStore(editor);
    return () => {
      opening.current += 1;
      root.unregisterModalStore(editor);
    };
  }, [root, editor]);
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
    async (ref: { typeId: string; recordId?: string }) => {
      const generation = ++opening.current;
      try {
        const result = await getRecordEditorAction({
          typeId: ref.typeId,
          ...(ref.recordId ? { recordId: ref.recordId } : {}),
        });
        if (generation !== opening.current) return;
        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }
        editor.edit(result.data, result.data.record);
      } catch {
        if (generation === opening.current) toast.error(t("Common.notifications.unexpectedError"));
      }
    },
    [editor, t],
  );
  const openRelated = useCallback(
    (ref: RecordRef) => {
      runUserAction(() => openEditor(ref));
    },
    [openEditor],
  );
  const openRecord = useCallback(
    (record: RecordRow) => {
      runUserAction(() => openEditor(record.ref));
    },
    [openEditor],
  );
  const recordColumns = store.recordColumns;
  const columns = useMemo<ColumnDef<RecordRow>[]>(
    () =>
      recordColumns.map((column) => ({
        id: column.id,
        header: column.label,
        cell: ({ row }) => (
          <RecordCell
            column={column}
            record={row.original}
            onMore={() => openRecord(row.original)}
            onOpen={openRelated}
          />
        ),
      })),
    [recordColumns, openRecord, openRelated],
  );
  const handleAdd = useCallback(() => {
    runUserAction(() => openEditor({ typeId: store.presentation.typeId }));
  }, [openEditor, store]);
  const handleExport = useRecordExport(store.presentation);
  const handleImport = useCallback(() => setImportOpen(true), []);
  const toolbar = useMemo(
    () => (
      <>
        <DataViewToolbar
          anchorScope="records"
          store={store}
          onAdd={handleAdd}
          onExport={handleExport}
          onImport={handleImport}
        />

        {store.presentation.canManageSchema && (
          <Button asChild size="sm" variant="secondary">
            <IntlLink href={`/company/data-model?typeId=${presentation.typeId}`} id="records-configure">
              {t("RecordModel.configure")}
            </IntlLink>
          </Button>
        )}
      </>
    ),
    [store, store.presentation.canManageSchema, handleAdd, handleExport, handleImport, presentation.typeId, t],
  );
  useSetTopBarActions(toolbar);
  const view = resolveDataViewView(store.viewMode, store.canBoard);
  const state = resolveDataViewPageState({
    explicitlyUnpaginated: false,
    hasActiveQuery: Boolean(store.searchTerm?.trim()) || Boolean(store.filters?.length),
    isGrouped: store.isGrouped,
    itemCount: store.items.length,
    request: store.dataRequest,
    total: store.pagination?.total,
  });
  let body: ReactNode;
  switch (state) {
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
      body = <DataViewContent columns={columns} store={store} view={view} onRowClick={openRecord} />;
      break;
    default: {
      const exhaustive: never = state;
      body = exhaustive;
    }
  }
  return (
    <>
      <DataViewLayout showPagination={state === "content" && view !== "board" && !store.isGrouped} store={store}>
        {store.pendingBoardOperation && (
          <RecordOperationProgress
            operationId={store.pendingBoardOperation}
            onCompleted={store.boardOperationCompleted}
            onStopped={store.boardOperationStopped}
          />
        )}

        {body}
      </DataViewLayout>

      <RecordEditor store={editor} />

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
