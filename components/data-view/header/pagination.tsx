"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [5, 10, 25, 100] as const;

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  className?: string;
};

export const DataViewPagination = observer(function DataViewPagination<E extends HasId>({
  store,
  className,
}: Props<E>) {
  const t = useTranslations();
  const page = store.pagination?.page ?? 1;
  const pageSize = store.pagination?.pageSize ?? 25;
  const totalPages = store.pagination?.totalPages ?? 1;
  const total = store.pagination?.total;

  const rangeStart = total ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = total !== undefined ? Math.min(page * pageSize, total) : 0;
  const summary =
    total === undefined
      ? ""
      : total === 0
        ? t("Common.table.paginationEmpty")
        : t("Common.table.paginationRange", {
            from: rangeStart,
            to: rangeEnd,
            total,
          });

  function setPage(next: number) {
    if (next < 1 || next > totalPages) return;
    store.setQueryOptions({ pagination: { page: next, pageSize } });
  }

  function setPageSize(next: number) {
    store.setQueryOptions({
      pagination: { page: 1, pageSize: next as 5 | 10 | 25 | 100 },
    });
  }

  return (
    <div className={cn("flex items-center justify-between gap-2 px-4 py-3", className)}>
      <div className="text-sm text-muted-foreground truncate">{summary}</div>

      <div className="flex items-center gap-2 shrink-0">
        <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
          <SelectTrigger className="w-20" size="sm">
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          aria-label={t("Common.table.previousPage")}
          disabled={page <= 1}
          size="icon-sm"
          variant="secondary"
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>

        <Button
          aria-label={t("Common.table.nextPage")}
          disabled={page >= totalPages}
          size="icon-sm"
          variant="secondary"
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
});
