"use client";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import type { RecordEditorStore } from "./record-editor.store";
import type { RecordRelationshipPath } from "@/features/records/record-relationship-path.schema";

import { Button } from "@/components/ui/button";
import { AppChip } from "@/components/chip/app-chip";
import { recordLinkColor } from "@/features/records/record-presentation";
import { useRecordChoices } from "./record-relationship-editor";
import { RecordDetailField } from "./record-detail-field";
import { relationshipPathColumnKey } from "@/features/records/record-column.schema";

export const RecordPathRecords = observer(function RecordPathRecords({
  store,
  path,
  targetTypeId,
}: {
  store: RecordEditorStore;
  path: RecordRelationshipPath;
  targetTypeId: string;
}) {
  const t = useTranslations();
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const result = useRecordChoices(
    {
      typeId: targetTypeId,
      page,
      pageSize: 25,
      ...(store.record ? { throughPath: { ref: store.record.ref, pathId: path.id } } : {}),
    },
    store.isOpen && store.record !== null,
    attempt + store.relatedRevision,
  );
  useEffect(() => {
    const data = result.data;
    if (data) setPage((current) => Math.min(current, Math.max(1, Math.ceil(data.total / data.pageSize))));
  }, [result.data]);
  return (
    <section aria-label={path.label} className="space-y-1.5">
      <RecordDetailField fieldId={relationshipPathColumnKey(path.id)} label={path.label}>
        {result.failed ? (
          <div className="flex items-center gap-2 text-sm" role="alert">
            <span>{t("Common.notifications.unexpectedError")}</span>

            <Button size="sm" type="button" variant="secondary" onClick={() => setAttempt((attempt) => attempt + 1)}>
              {t("ErrorCard.retry")}
            </Button>
          </div>
        ) : result.loading ? (
          <span className="text-sm text-muted-foreground" role="status">
            {t("Loading.text")}
          </span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {result.data?.records.map((record) => {
              const title =
                record.title.state === "restricted"
                  ? t("RecordModel.restricted")
                  : record.title.state === "error"
                    ? t("RecordModel.calculationError")
                    : record.title.state === "value" && record.title.value.kind === "text"
                      ? record.title.value.value
                      : t("RecordModel.record");
              return (
                <button
                  key={`${record.ref.typeId}:${record.ref.recordId}`}
                  aria-label={t("RecordModel.openRecord", { name: title })}
                  className="max-w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  type="button"
                  onClick={(event) => store.rootStore.recordWorkspaceStore.open(record.ref, event.currentTarget)}
                >
                  <AppChip interactive variant={recordLinkColor(store.presentation.linkColors, record.ref.typeId)}>
                    {title}
                  </AppChip>
                </button>
              );
            })}

            {result.data?.total === 0 && <span className="text-sm text-muted-foreground">—</span>}
          </div>
        )}

        {result.data && result.data.total > result.data.pageSize && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Button
              disabled={page === 1 || result.loading}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => setPage((page) => page - 1)}
            >
              {t("Common.table.previousPage")}
            </Button>

            <span>{t("RecordModel.linkedRecordCount", { count: result.data.total })}</span>

            <Button
              disabled={page * result.data.pageSize >= result.data.total || result.loading}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => setPage((page) => page + 1)}
            >
              {t("Common.table.nextPage")}
            </Button>
          </div>
        )}
      </RecordDetailField>
    </section>
  );
});
