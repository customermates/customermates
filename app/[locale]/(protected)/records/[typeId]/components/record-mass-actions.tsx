"use client";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { toJS } from "mobx";
import { z } from "zod";
import { ChevronDown, ChevronLeft, ChevronRight, Search, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RecordField } from "@/features/records/record-model.schema";
import type { RecordsStore } from "./records.store";
import { RecordScalarSchema } from "@/features/records/record-model.schema";
import { recordInputValue } from "@/features/records/record-input-value";
import { BaseFormStore } from "@/core/base/base-form.store";
import { AppForm } from "@/components/forms/form-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveOverlay } from "@/components/modal/responsive-overlay";
import { runUserAction } from "@/core/errors/report-application-error";
import { RecordInputField } from "./record-input-field";
import { useRecordDeletion } from "./use-record-deletion";

class BulkFieldStore extends BaseFormStore<{ value: unknown }> {
  constructor(
    readonly records: RecordsStore,
    readonly field: RecordField,
    readonly done: () => void,
  ) {
    super(records.rootStore, { value: undefined });
  }
  override get isReadOnly() {
    return !this.records.presentation.permittedActions.includes("update");
  }
  onSubmit = async () => this.apply(false);
  apply = async (clear: boolean) => {
    if (this.isReadOnly || this.isLoading) return;
    const value = clear
      ? null
      : recordInputValue(toJS(this.form.value), this.field, this.rootStore.companyStore.company?.currency ?? "EUR");
    if (value !== null) {
      const parsed = RecordScalarSchema.safeParse(value);
      if (!parsed.success) {
        this.setError({
          errors: [],
          properties: { value: z.treeifyError(parsed.error) },
        });
        return;
      }
    }
    this.setIsLoading(true);
    try {
      if (await this.records.bulkUpdateField(this.field.id, value)) this.done();
    } finally {
      this.setIsLoading(false);
    }
  };
}

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
  const [store] = useState(() => new BulkFieldStore(records, field, onApplied));
  return (
    <AppForm store={store}>
      <div className="space-y-3 px-3 py-2.5">
        <RecordInputField field={field} id="value" />

        <div className="flex items-center gap-2">
          <Button
            disabled={field.required || store.isLoading || records.isBulkMutating}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => runUserAction(() => store.apply(true))}
          >
            {t("MassActions.clearField")}
          </Button>

          <div className="grow" />

          <Button
            disabled={
              store.isLoading || records.isBulkMutating || store.form.value === undefined || store.form.value === ""
            }
            size="sm"
            type="submit"
          >
            {t("MassActions.apply")}
          </Button>
        </div>
      </div>
    </AppForm>
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
  const fields = store.fields.filter(
    (field) =>
      field.behavior.kind === "input" || (field.behavior.kind === "snapshot" && field.behavior.allowManualOverride),
  );
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
          variant="secondary"
          onClick={() =>
            runUserAction(() => deletion.requestMany(store.selectionTargets, store.presentation.model.revision))
          }
        >
          <Trash2 className="size-4 text-destructive" />

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
