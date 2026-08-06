"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { CustomColumnDto, CustomColumnOption } from "@/features/custom-column/custom-column.schema";

import { ChevronDownIcon, SearchIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CustomColumnType } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveOverlay } from "@/components/modal";
type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
};

const SEARCH_THRESHOLD = 6;

export const MassUpdatePopover = observer(function MassUpdatePopover<E extends HasId>({ store }: Props<E>) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const entityType = store.entityType;
  const columns = store.singleSelectCustomColumns.filter(
    (c): c is Extract<CustomColumnDto, { type: typeof CustomColumnType.singleSelect }> =>
      c.type === CustomColumnType.singleSelect && c.options.options.length > 0,
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return columns;
    const q = query.toLowerCase();
    return columns.filter((c) => c.label.toLowerCase().includes(q));
  }, [columns, query]);

  if (!entityType || columns.length === 0) return null;

  async function applyOption(column: CustomColumnDto, option: CustomColumnOption) {
    const ok = await store.bulkUpdateCustomField(column.id, option.value);
    if (ok) setOpen(false);
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

  return (
    <ResponsiveOverlay
      open={open}
      popoverClassName="w-80"
      title={t("MassActions.update")}
      trigger={trigger}
      onOpenChange={setOpen}
    >
      <div className="flex flex-col divide-y divide-border">
        {showSearch && (
          <div className="flex items-center gap-2 p-2">
            <SearchIcon className="size-3.5 text-muted-foreground shrink-0" />

            <Input
              autoFocus
              className="h-7 border-0 shadow-none focus-visible:ring-0 px-0"
              placeholder={t("MassActions.searchFieldPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t("MassActions.noMatchingFields")}</div>
        ) : (
          filtered.map((column) => (
            <div key={column.id} className="flex flex-col gap-1.5 p-2">
              <span className="text-xs text-muted-foreground px-1">{column.label}</span>

              <div className="flex flex-wrap gap-1">
                {column.options.options.map((option) => (
                  <button
                    key={option.value}
                    className="cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={store.isBulkMutating}
                    type="button"
                    onClick={() => void applyOption(column, option)}
                  >
                    <AppChip interactive variant={option.color}>
                      <span className="truncate">{option.label}</span>
                    </AppChip>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </ResponsiveOverlay>
  );
});
