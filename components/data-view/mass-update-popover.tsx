"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { CustomColumnDto, CustomColumnOption } from "@/features/custom-column/custom-column.schema";

import { ChevronDownIcon, SearchIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CustomColumnType } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useApplicationErrorHandler } from "@/components/shared/unexpected-error-toaster";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { bulkUpdateCustomFieldValuesAction } from "@/app/actions";
type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
};

const SEARCH_THRESHOLD = 6;

export const MassUpdatePopover = observer(function MassUpdatePopover<E extends HasId>({ store }: Props<E>) {
  const t = useTranslations("");
  const handleApplicationError = useApplicationErrorHandler();
  const [isLoading, setIsLoading] = useState(false);
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
    const entityIds = Array.from(store.selectedIds);
    if (entityIds.length === 0 || !entityType) return;

    setIsLoading(true);
    try {
      const res = await bulkUpdateCustomFieldValuesAction({
        entityType,
        entityIds,
        customFieldValues: [{ columnId: column.id, value: option.value }],
      });
      if (res && !res.ok) {
        if (!toastZodErrorTree(res.error)) toast.error(t("Common.notifications.unexpectedError"));
        await store.refresh();
        return;
      }
      store.clearSelection();
      await store.refresh();
      toast.success(t("Common.notifications.updated"));
      setOpen(false);
    } catch (err) {
      handleApplicationError(err);
    } finally {
      setIsLoading(false);
    }
  }

  const showSearch = columns.length > SEARCH_THRESHOLD;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("MassActions.update")}
          className="h-8 gap-1.5"
          disabled={isLoading}
          size="sm"
          variant="outline"
        >
          {t("MassActions.update")}

          <ChevronDownIcon className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 p-0 max-h-[70vh] overflow-y-auto">
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
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t("MassActions.noMatchingFields")}
            </div>
          ) : (
            filtered.map((column) => (
              <div key={column.id} className="flex flex-col gap-1.5 p-2">
                <span className="text-xs text-muted-foreground px-1">{column.label}</span>

                <div className="flex flex-wrap gap-1">
                  {column.options.options.map((option) => (
                    <button
                      key={option.value}
                      className="cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isLoading}
                      type="button"
                      onClick={() => void applyOption(column, option)}
                    >
                      <AppChip className="hover:opacity-80 transition-opacity" variant={option.color}>
                        <span className="truncate">{option.label}</span>
                      </AppChip>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});
