"use client";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RecordFieldView } from "@/features/records/record-model.schema";
import type { RecordsStore } from "./records.store";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { OverlayBackTitle } from "@/components/shared/overlay-back-title";
import { DataViewSelectionBar } from "@/components/data-view/data-view-selection-bar";
import { ResponsiveOverlay } from "@/components/modal/responsive-overlay";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRecordDeletion } from "./use-record-deletion";
import { isRecordFieldWritable, recordDraftValue } from "@/features/records/record-input-value";
import { RecordFieldValueEditor, RecordFieldValueStore } from "./record-field-value-editor";

const BulkFieldEditor = observer(function BulkFieldEditor({
  records,
  field,
  onApplied,
  onCancel,
}: {
  records: RecordsStore;
  field: RecordFieldView;
  onApplied: () => void;
  onCancel: () => void;
}) {
  const [store] = useState(
    () =>
      new RecordFieldValueStore(
        records.rootStore,
        field,
        recordDraftValue(null, field),
        async (value) => ({ saved: await records.bulkUpdateField(field.id, value) }),
        onApplied,
      ),
  );
  return (
    <div className="px-3 py-2.5">
      <RecordFieldValueEditor busy={records.isBulkMutating} store={store} onCancel={onCancel} />
    </div>
  );
});

export const RecordMassActions = observer(function RecordMassActions({ store }: { store: RecordsStore }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const deletion = useRecordDeletion({
    onDeleted: store.bulkCompleted,
    onPending: (id) => store.setBulkState(false, id),
    mutateMany: store.bulkMutation,
  });
  const fields = store.fields.filter(isRecordFieldWritable);
  const active = fields.find((field) => field.id === activeId);
  const close = () => {
    setOpen(false);
    setActiveId(null);
  };
  const busy = store.isBulkMutating || Boolean(store.pendingBulkOperation);
  return (
    <DataViewSelectionBar
      busy={busy}
      data-record-mass-actions=""
      status={
        store.isSelectionScopeStale && (
          <>
            <span className="text-xs text-muted-foreground">{t("MassActions.scopeStale")}</span>

            <Button disabled={busy} size="sm" type="button" variant="ghost" onClick={store.keepSelectionInView}>
              {t("MassActions.keepInView")}
            </Button>
          </>
        )
      }
      store={store}
    >
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
              <OverlayBackTitle onBack={() => setActiveId(null)}>{t("MassActions.edit")}</OverlayBackTitle>
            ) : (
              t("MassActions.edit")
            )
          }
          trigger={
            <Button disabled={busy} size="sm" variant="secondary">
              {t("MassActions.edit")}

              <ChevronDown aria-hidden />
            </Button>
          }
          onOpenChange={(next) => {
            if (!next) close();
            else setOpen(true);
          }}
        >
          {active ? (
            <BulkFieldEditor
              key={active.id}
              field={active}
              records={store}
              onApplied={close}
              onCancel={() => setActiveId(null)}
            />
          ) : (
            <Command loop className="h-auto! min-h-0 overflow-visible bg-transparent" label={t("MassActions.edit")}>
              {fields.length > 6 && <CommandInput autoFocus placeholder={t("MassActions.searchFieldPlaceholder")} />}

              <CommandList className="max-h-none! overflow-visible">
                <CommandEmpty>{t("MassActions.noMatchingFields")}</CommandEmpty>

                {fields.map((field) => (
                  <CommandItem
                    key={field.id}
                    value={`${field.label} ${field.id}`}
                    onSelect={() => setActiveId(field.id)}
                  >
                    <span className="min-w-0 flex-1 truncate">{field.label}</span>

                    <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
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
          <Trash2 aria-hidden />

          {t("MassActions.delete")}
        </Button>
      )}
    </DataViewSelectionBar>
  );
});
