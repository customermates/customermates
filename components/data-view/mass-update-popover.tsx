"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { AppForm } from "@/components/forms/form-context";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { Input } from "@/components/ui/input";
import { ResponsiveOverlay } from "@/components/modal";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";

import { CUSTOM_COLUMN_TYPE_ICON } from "./custom-columns/custom-column-type-icon";
import { CustomFieldEditor } from "./custom-columns/custom-field-editor";
import { MASS_UPDATE_VALUE_PATH, MassUpdateFormStore } from "./mass-update-form.store";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
};

type EditorProps<E extends HasId> = {
  column: CustomColumnDto;
  store: BaseDataViewStore<E>;
  onApplied: () => void;
};

const SEARCH_THRESHOLD = 6;

const MassFieldEditor = observer(function MassFieldEditor<E extends HasId>({
  column,
  store,
  onApplied,
}: EditorProps<E>) {
  const t = useTranslations();
  const rootStore = useRootStore();
  const formStore = useMemo(() => new MassUpdateFormStore(rootStore, column.id), [rootStore, column.id]);

  async function applyValue(value: string) {
    const ok = await store.bulkUpdateCustomField(column.id, value);
    if (ok) onApplied();
  }

  const currentValue = formStore.value;

  return (
    <AppForm store={formStore}>
      <div className="flex flex-col gap-3 px-3 py-2.5">
        <CustomFieldEditor
          column={column}
          id={MASS_UPDATE_VALUE_PATH}
          label={column.label}
          value={currentValue}
          onChange={(next) => formStore.onChange(MASS_UPDATE_VALUE_PATH, next)}
        />

        <div className="flex items-center gap-2">
          <Button
            className="h-8"
            disabled={store.isBulkMutating}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => runUserAction(() => applyValue(""))}
          >
            {t("MassActions.clearField")}
          </Button>

          <div className="grow" />

          <Button
            className="h-8"
            disabled={store.isBulkMutating || currentValue === undefined || currentValue === ""}
            size="sm"
            type="button"
            onClick={() => runUserAction(() => applyValue(currentValue ?? ""))}
          >
            {t("MassActions.apply")}
          </Button>
        </div>
      </div>
    </AppForm>
  );
});

export const MassUpdatePopover = observer(function MassUpdatePopover<E extends HasId>({ store }: Props<E>) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeColumnId, setActiveColumnId] = useState<string | undefined>(undefined);

  const entityType = store.entityType;
  const columns = store.massEditableCustomColumns;

  const filtered = useMemo(() => {
    if (!query.trim()) return columns;
    const q = query.toLowerCase();
    return columns.filter((c) => c.label.toLowerCase().includes(q));
  }, [columns, query]);

  const activeColumn = columns.find((column) => column.id === activeColumnId);

  if (!entityType || columns.length === 0) return null;

  function closeAndReset() {
    setOpen(false);
    setActiveColumnId(undefined);
    setQuery("");
  }

  const showSearch = columns.length > SEARCH_THRESHOLD;

  const trigger = (
    <Button
      aria-label={t("MassActions.update")}
      className="h-8 gap-1.5"
      disabled={store.isBulkMutating}
      size="sm"
      variant="secondary"
    >
      {t("MassActions.update")}

      <ChevronDownIcon className="size-3.5 opacity-60" />
    </Button>
  );

  const title = activeColumn ? (
    <button
      className="flex cursor-pointer items-center gap-1.5 outline-none"
      type="button"
      onClick={() => setActiveColumnId(undefined)}
    >
      <ChevronLeftIcon className="size-3.5 opacity-60" />

      <span className="truncate">{t("MassActions.update")}</span>
    </button>
  ) : (
    t("MassActions.update")
  );

  return (
    <ResponsiveOverlay
      open={open}
      popoverClassName="w-80"
      title={title}
      trigger={trigger}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setActiveColumnId(undefined);
      }}
    >
      {activeColumn ? (
        <MassFieldEditor column={activeColumn} store={store} onApplied={closeAndReset} />
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {showSearch && (
            <div className="flex items-center gap-2 px-3 py-2">
              <SearchIcon className="size-4 shrink-0 text-muted-foreground" />

              <Input
                autoFocus
                className="h-7 border-0 px-0 shadow-none focus-visible:ring-0"
                placeholder={t("MassActions.searchFieldPlaceholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t("MassActions.noMatchingFields")}
            </div>
          ) : (
            filtered.map((column) => (
              <button
                key={column.id}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                disabled={store.isBulkMutating}
                type="button"
                onClick={() => setActiveColumnId(column.id)}
              >
                <Icon className="shrink-0 text-muted-foreground" icon={CUSTOM_COLUMN_TYPE_ICON[column.type]} />

                <span className="min-w-0 flex-1 truncate">{column.label}</span>

                <ChevronRightIcon className="size-3.5 shrink-0 opacity-60" />
              </button>
            ))
          )}
        </div>
      )}
    </ResponsiveOverlay>
  );
});
