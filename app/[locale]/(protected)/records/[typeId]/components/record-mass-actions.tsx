"use client";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { ChevronDown, ChevronLeft, ChevronRight, Search, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RecordField } from "@/features/records/record-model.schema";
import type { RecordsStore } from "./records.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveOverlay } from "@/components/modal/responsive-overlay";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRecordDeletion } from "./use-record-deletion";
import { isRecordFieldWritable } from "@/features/records/record-input-value";
import { RecordFieldValueEditor, RecordFieldValueStore } from "./record-field-value-editor";

const BulkFieldEditor = observer(function BulkFieldEditor({
  records,
  field,
  onApplied,
}: {
  records: RecordsStore;
  field: RecordField;
  onApplied: () => void;
}) {
  const t = useTranslations();
  const [store] = useState(
    () =>
      new RecordFieldValueStore(
        records.rootStore,
        field,
        undefined,
        async (value) => ({ saved: await records.bulkUpdateField(field.id, value) }),
        onApplied,
      ),
  );
  return (
    <div className="px-3 py-2.5">
      <RecordFieldValueEditor busy={records.isBulkMutating} store={store} submitLabel={t("MassActions.apply")} />
    </div>
  );
});

export const RecordMassActions = observer(function RecordMassActions({ store }: { store: RecordsStore }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const deletion = useRecordDeletion({
    onDeleted: store.bulkCompleted,
    onPending: (id) => store.setBulkState(false, id),
    mutateMany: store.bulkMutation,
  });
  if (!store.hasSelection || !store.supportsSelection) return null;
  const fields = store.fields.filter(isRecordFieldWritable);
  const active = fields.find((field) => field.id === activeId);
  const filtered = fields.filter((field) => field.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const close = () => {
    setOpen(false);
    setActiveId(null);
    setQuery("");
  };
  const busy = store.isBulkMutating || Boolean(store.pendingBulkOperation);
  return (
    <div
      data-record-mass-actions
      className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-card px-4 py-2"
    >
      <span className="whitespace-nowrap text-sm font-medium">
        {t("MassActions.selectedCount", { count: store.selectedCount })}
      </span>

      {store.selectedOffViewCount > 0 && (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {t("MassActions.offView", { count: store.selectedOffViewCount })}
        </span>
      )}

      {store.isSelectionScopeStale && (
        <>
          <span className="text-xs text-muted-foreground">{t("MassActions.scopeStale")}</span>

          <Button disabled={busy} size="sm" type="button" variant="ghost" onClick={store.keepSelectionInView}>
            {t("MassActions.keepInView")}
          </Button>
        </>
      )}

      <div className="grow" />

      {store.canRetryBulkRefresh && (
        <Button size="sm" type="button" variant="secondary" onClick={() => runUserAction(store.retryBulkRefresh)}>
          {t("ErrorCard.retry")}
        </Button>
      )}

      {store.presentation.permittedActions.includes("update") && fields.length > 0 && (
        <ResponsiveOverlay
          open={open}
          popoverClassName="w-80"
          title={
            active ? (
              <button className="flex items-center gap-1.5" type="button" onClick={() => setActiveId(null)}>
                <ChevronLeft className="size-3.5" />

                {t("MassActions.update")}
              </button>
            ) : (
              t("MassActions.update")
            )
          }
          trigger={
            <Button disabled={busy} size="sm" variant="secondary">
              {t("MassActions.update")}

              <ChevronDown className="size-3.5" />
            </Button>
          }
          onOpenChange={(next) => {
            if (!next) close();
            else setOpen(true);
          }}
        >
          {active ? (
            <BulkFieldEditor key={active.id} field={active} records={store} onApplied={close} />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {fields.length > 6 && (
                <div className="flex items-center gap-2 px-3 py-2">
                  <Search className="size-4 shrink-0 text-muted-foreground" />

                  <Input
                    aria-label={t("MassActions.searchFieldPlaceholder")}
                    className="h-7 border-0 px-0 shadow-none"
                    placeholder={t("MassActions.searchFieldPlaceholder")}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              )}

              {filtered.length ? (
                filtered.map((field) => (
                  <button
                    key={field.id}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    type="button"
                    onClick={() => setActiveId(field.id)}
                  >
                    {field.label}

                    <ChevronRight className="size-3.5" />
                  </button>
                ))
              ) : (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t("MassActions.noMatchingFields")}
                </p>
              )}
            </div>
          )}
        </ResponsiveOverlay>
      )}

      {store.presentation.permittedActions.includes("delete") && (
        <Button
          disabled={busy || deletion.isPreviewing}
          id="mass-delete"
          size="sm"
          type="button"
          variant="destructiveOutline"
          onClick={() =>
            runUserAction(() => deletion.requestMany(store.selectionTargets, store.presentation.model.revision))
          }
        >
          <Trash2 className="size-4" />

          {t("MassActions.delete")}
        </Button>
      )}

      <Button
        aria-label={t("Common.actions.clear")}
        disabled={busy}
        size="icon-sm"
        type="button"
        variant="secondary"
        onClick={store.clearSelection}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
});
