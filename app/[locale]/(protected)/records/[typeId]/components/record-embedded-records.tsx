"use client";

import type { ReactNode } from "react";
import type { RecordDto, RecordRef, RecordType } from "@/features/records/record-model.schema";
import type { RecordRow } from "@/features/records/record-presentation";

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";

import { DataViewContent } from "@/components/data-view/data-view-content";
import { DataViewPagination } from "@/components/data-view/header/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectionOptionsSkeleton } from "@/components/forms/selection-loading";
import { recordTitle } from "@/components/records/record-title";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { relationshipColumnKey } from "@/features/records/record-column.schema";
import { isRecordFieldWritable } from "@/features/records/record-input-value";
import { getRecordEditorAction } from "../../actions";
import { EMBEDDED_PAGE_SIZE, EmbeddedRecordsStore, embeddedPresentation } from "./embedded-records.store";
import { RecordDetailField } from "./record-detail-field";
import { RecordEditorStore } from "./record-editor.store";
import { RecordRowActions } from "./record-row-actions";
import { useRecordCardRenderer, useRecordTableColumns } from "./record-table-columns";
import { useRecordDeletion } from "./use-record-deletion";

const EmbeddedAddLine = observer(function EmbeddedAddLine({
  list,
  type,
  onOpenEditor,
}: {
  list: EmbeddedRecordsStore;
  type: RecordType;
  onOpenEditor: (name?: string) => void;
}) {
  const t = useTranslations();
  const [draft, setDraft] = useState<string | null>(null);
  const settled = useRef(false);
  const label = t("RecordModel.addEmbedded", { type: type.label });
  const primary = list.fields.find((field) => field.id === type.primaryFieldId);
  const inline = primary && primary.valueType === "text" && isRecordFieldWritable(primary);
  if (draft === null || !primary) {
    return (
      <Button
        className="justify-start px-2 text-muted-foreground"
        data-embedded-add=""
        size="sm"
        type="button"
        variant="ghost"
        onClick={() => {
          if (!inline) return onOpenEditor();
          settled.current = false;
          setDraft("");
        }}
      >
        <Plus className="size-4" />

        {label}
      </Button>
    );
  }
  const commit = () =>
    runUserAction(async () => {
      if (settled.current) return;
      settled.current = true;
      const name = draft.trim();
      setDraft(null);
      if (!name) return;
      const { created } = await list.createChild(primary.id, name);
      if (!created) onOpenEditor(name);
    });
  return (
    <Input
      autoFocus
      aria-label={label}
      className="h-8"
      data-embedded-draft=""
      data-local-escape=""
      placeholder={primary.label}
      value={draft}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
        if (event.key === "Escape") {
          event.stopPropagation();
          settled.current = true;
          setDraft(null);
        }
      }}
    />
  );
});

export const RecordEmbeddedRecords = observer(function RecordEmbeddedRecords({
  store,
  type,
  renderEditor,
}: {
  store: RecordEditorStore;
  type: RecordType;
  renderEditor: (child: RecordEditorStore) => ReactNode;
}) {
  const t = useTranslations();
  const parentRelationId = type.parentRelationshipId ?? "";
  const listPresentation = () =>
    embeddedPresentation(store.presentation, type.id, {
      "system:createdAt": t("RecordModel.createdAt"),
      "system:updatedAt": t("RecordModel.updatedAt"),
      "system:assignedTo": t("RecordModel.assignedTo"),
      "system:channels": t("EntityChannels.heading"),
    });
  const parentEditable = () =>
    Boolean(store.record) && !store.isReadOnly && !store.hasUnsavedChanges && !store.isLoading;
  const [list] = useState(() => {
    const created: EmbeddedRecordsStore = new EmbeddedRecordsStore(
      store.rootStore,
      listPresentation(),
      parentRelationId,
      parentEditable,
      async () => {
        await store.reloadAfterNestedChange();
        await created.refresh();
      },
    );
    return created;
  });
  const [child] = useState(
    () =>
      new RecordEditorStore(store.rootStore, { ...store.presentation, typeId: type.id }, async () => {
        await store.reloadAfterNestedChange();
        await list.refresh();
      }),
  );
  const deletion = useRecordDeletion({
    onDeleted: async () => {
      await store.reloadAfterNestedChange();
      await list.refresh();
    },
    onPending: store.setPendingOperation,
    captureSession: store.captureSession,
    sessionKey: store.sessionKey,
    onInvalidated: store.rootStore.recordWorkspaceStore.invalidate,
  });
  const parent = store.record;
  const key =
    parent && store.isOpen
      ? JSON.stringify([parent.ref, parent.version, store.presentation.model.revision, store.relatedRevision])
      : null;
  useEffect(() => {
    store.rootStore.registerModalStore(child);
    return () => store.rootStore.unregisterModalStore(child);
  }, [store, child]);
  useEffect(() => {
    list.setPresentation(listPresentation());
    list.setParent(key ? (JSON.parse(key)[0] as RecordRef) : null);
    if (key) void list.load().catch(reportApplicationError);
  }, [key, list, store.presentation, type.id]);
  const parentType = store.presentation.model.types.find((candidate) => candidate.id === parent?.ref.typeId);
  const editable = parentEditable();
  const canDelete = editable && list.presentation.permittedActions.includes("delete");
  const canCreate = editable && list.presentation.permittedActions.includes("create");
  const canOpen = !store.hasUnsavedChanges && !store.isLoading;
  const open = (record?: RecordDto, name?: string) =>
    runUserAction(async () => {
      if (!parent || !type.parentRelationshipId || (!record && !editable)) return;
      const isCurrent = store.captureSession();
      const context = await getRecordEditorAction({
        typeId: type.id,
        ...(record ? { recordId: record.ref.recordId } : {}),
      });
      if (!isCurrent()) return;
      if (!context.ok) {
        toastZodErrorTree(context.error);
        return;
      }
      child.edit(context.data, context.data.record, {
        relationId: type.parentRelationshipId,
        record: { typeId: parent.ref.typeId, recordId: parent.ref.recordId },
        title: parent.fields.find((field) => field.fieldId === parentType?.primaryFieldId)?.result ?? {
          state: "missing",
        },
      });
      if (name && type.primaryFieldId) child.onChange(`values.${type.primaryFieldId}`, name);
    });
  const recordName = (record: RecordRow) =>
    recordTitle(record.fields.find((field) => field.fieldId === type.primaryFieldId)?.result, type.label, t);
  const openRelated = (ref: RecordRef) => store.rootStore.recordWorkspaceStore.open(ref);
  const columns = useRecordTableColumns(list, openRelated, { markCalculated: true });
  const renderCard = useRecordCardRenderer(list, openRelated);
  const rows = list.items;
  return (
    <section aria-label={type.pluralLabel}>
      <RecordDetailField
        action={
          list.total > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums" data-embedded-count="">
              {list.total}
            </span>
          ) : undefined
        }
        fieldId={relationshipColumnKey(parentRelationId, "incoming")}
        label={type.pluralLabel}
      >
        <div className="min-w-0 space-y-1">
          {!parent || store.hasUnsavedChanges ? (
            <p className="text-xs text-muted-foreground">{t("RecordModel.saveBeforeEmbedded")}</p>
          ) : null}

          {key && !list.isReady && !list.loadFailed && (
            <span aria-label={t("Loading.text")} role="status">
              <SelectionOptionsSkeleton label={t("Loading.text")} />
            </span>
          )}

          {(list.loadFailed || list.dataRequest.status === "refresh-error") && (
            <div className="flex items-center gap-2 text-sm" role="alert">
              <span>{t("Common.notifications.unexpectedError")}</span>

              <Button size="sm" type="button" variant="secondary" onClick={() => runUserAction(() => list.load())}>
                {t("ErrorCard.retry")}
              </Button>
            </div>
          )}

          {rows.length > 0 && (
            <DataViewContent
              columns={columns}
              renderCard={renderCard}
              rowActions={(record) => (
                <RecordRowActions
                  name={recordName(record)}
                  onDelete={
                    canDelete && !deletion.isPreviewing
                      ? () => deletion.requestDeletion(record, store.presentation.model.revision, recordName(record))
                      : undefined
                  }
                  onOpen={canOpen ? () => open(record) : undefined}
                />
              )}
              store={list}
              totals={list.totals}
              view="table"
              onRowClick={canOpen ? (record) => open(record) : undefined}
            />
          )}

          {list.total > (list.pagination?.pageSize ?? EMBEDDED_PAGE_SIZE) && <DataViewPagination store={list} />}

          {canCreate && <EmbeddedAddLine list={list} type={type} onOpenEditor={(name) => open(undefined, name)} />}
        </div>

        {renderEditor(child)}
      </RecordDetailField>
    </section>
  );
});
