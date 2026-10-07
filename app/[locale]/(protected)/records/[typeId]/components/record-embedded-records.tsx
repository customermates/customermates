"use client";

import { useEffect, useState, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { RecordDto, RecordType } from "@/features/records/record-model.schema";
import type { RecordQueryResult } from "@/features/records/record-query-result.schema";
import { RecordQuerySchema } from "@/features/records/record-query.schema";
import { RecordEditorStore } from "./record-editor.store";
import { RecordValue } from "./record-value";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRecordDeletion } from "./use-record-deletion";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { getRecordEditorAction, queryRecordsAction } from "../../actions";
import { RecordDetailField } from "./record-detail-field";
import { relationshipColumnKey } from "@/features/records/record-column.schema";

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
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [request, setRequest] = useState<{ key: string; data: RecordQueryResult | null } | null>(null);
  const [child] = useState(
    () =>
      new RecordEditorStore(store.rootStore, { ...store.presentation, typeId: type.id }, async () => {
        await store.reloadAfterNestedChange();
        setAttempt((value) => value + 1);
      }),
  );
  const deletion = useRecordDeletion({
    onDeleted: async () => {
      await store.reloadAfterNestedChange();
      setAttempt((value) => value + 1);
    },
    onPending: store.setPendingOperation,
    captureSession: store.captureSession,
    sessionKey: store.sessionKey,
    onInvalidated: store.rootStore.recordWorkspaceStore.invalidate,
  });
  const parent = store.record;
  const key =
    parent && store.isOpen
      ? JSON.stringify([
          parent.ref,
          parent.version,
          store.presentation.model.revision,
          page,
          type.id,
          type.parentRelationshipId,
          attempt,
          store.relatedRevision,
        ])
      : null;
  useEffect(() => {
    store.rootStore.registerModalStore(child);
    return () => store.rootStore.unregisterModalStore(child);
  }, [store, child]);
  useEffect(() => {
    if (!key) return;
    let active = true;
    const [ref, , , page, typeId, relationId] = JSON.parse(key);
    const query = RecordQuerySchema.parse({
      typeId,
      page,
      pageSize: 10,
      relationships: [{ relationId, direction: "outgoing", operator: "any", recordIds: [ref.recordId] }],
    });
    void queryRecordsAction(query)
      .then((result) => {
        if (active) setRequest({ key, data: result.ok ? result.data : null });
      })
      .catch(() => {
        if (active) setRequest({ key, data: null });
      });
    return () => {
      active = false;
    };
  }, [key]);
  const current = request?.key === key ? request : null;
  useEffect(() => {
    const data = current?.data;
    if (data) setPage((currentPage) => Math.min(currentPage, Math.max(1, Math.ceil(data.total / 10))));
  }, [current?.data]);
  const fields = store.presentation.model.fields.filter(
    (field) => field.typeId === type.id && field.valueType !== "richText" && !field.archived,
  );
  const visible = fields.filter(
    (field) => field.id === type.primaryFieldId || type.defaults.columns.includes(field.id),
  );
  const titleField = fields.find((field) => field.id === type.primaryFieldId);
  const parentType = store.presentation.model.types.find((type) => type.id === parent?.ref.typeId);
  const editable = Boolean(parent) && !store.isReadOnly && !store.hasUnsavedChanges && !store.isLoading;
  const open = (record?: RecordDto) =>
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
    });
  const remove = (record: RecordDto, name: string) =>
    runUserAction(() => deletion.requestDeletion(record, store.presentation.model.revision, name));
  return (
    <section aria-label={type.pluralLabel} className="space-y-3">
      <RecordDetailField
        fieldId={relationshipColumnKey(type.parentRelationshipId ?? "", "incoming")}
        label={type.pluralLabel}
      >
        <div className="flex items-center justify-between gap-2">
          {!store.isReadOnly && (
            <Button disabled={!editable} size="sm" type="button" variant="secondary" onClick={() => open()}>
              <Plus className="size-4" />

              {t("RecordModel.addEmbedded", { type: type.label })}
            </Button>
          )}
        </div>

        {!parent || store.hasUnsavedChanges ? (
          <p className="text-xs text-muted-foreground">{t("RecordModel.saveBeforeEmbedded")}</p>
        ) : null}

        {key && !current ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t("Loading.text")}
          </p>
        ) : null}

        {current?.data === null ? (
          <Button type="button" variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
            {t("ErrorCard.retry")}
          </Button>
        ) : null}

        {current?.data && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {visible.map((field) => (
                    <TableHead key={field.id}>{field.label}</TableHead>
                  ))}

                  <TableHead>
                    <span className="sr-only">{t("RecordModel.edit")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {current.data.records.map((record) => {
                  const primary = record.fields.find((field) => field.fieldId === type.primaryFieldId)?.result;
                  const name =
                    primary?.state === "value" && primary.value.kind === "text" ? primary.value.value : type.label;
                  return (
                    <TableRow key={record.ref.recordId}>
                      {visible.map((field) => (
                        <TableCell key={field.id}>
                          {field.id === titleField?.id ? (
                            <button
                              className="text-left font-medium hover:underline disabled:opacity-50"
                              disabled={store.hasUnsavedChanges || store.isLoading}
                              type="button"
                              onClick={() => open(record)}
                            >
                              <RecordValue field={field} result={primary} />
                            </button>
                          ) : (
                            <RecordValue
                              field={field}
                              result={record.fields.find((value) => value.fieldId === field.id)?.result}
                            />
                          )}
                        </TableCell>
                      ))}

                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            aria-label={t("RecordModel.openRecord", { name })}
                            disabled={store.hasUnsavedChanges || store.isLoading}
                            size="icon"
                            type="button"
                            variant="ghost"
                            onClick={() => open(record)}
                          >
                            <Pencil className="size-4" />
                          </Button>

                          {!store.isReadOnly && (
                            <Button
                              aria-label={t("RecordModel.deleteRecord", { name })}
                              disabled={!editable || deletion.isPreviewing}
                              size="icon"
                              type="button"
                              variant="destructiveGhost"
                              onClick={() => remove(record, name)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {current.data.total === 0 ? (
              <p className="text-sm text-muted-foreground">{t("RecordModel.empty", { type: type.pluralLabel })}</p>
            ) : null}

            {current.data.total > 10 ? (
              <div className="flex items-center gap-2">
                <Button
                  disabled={page === 1}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => setPage((value) => value - 1)}
                >
                  {t("Common.table.previousPage")}
                </Button>

                <span className="text-xs text-muted-foreground">
                  {t("RecordModel.linkedRecordCount", { count: current.data.total })}
                </span>

                <Button
                  disabled={page * 10 >= current.data.total}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => setPage((value) => value + 1)}
                >
                  {t("Common.table.nextPage")}
                </Button>
              </div>
            ) : null}
          </>
        )}

        {renderEditor(child)}
      </RecordDetailField>
    </section>
  );
});
