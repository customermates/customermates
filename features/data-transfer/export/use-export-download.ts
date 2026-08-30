"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { RequestedColumnInput } from "../data-transfer.schema";

import { toJS } from "mobx";
import { toast } from "sonner";
import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { EXPORT_ROW_LIMIT } from "../data-transfer.schema";
import { useColumnLabel } from "@/components/entity-terminology/use-column-label";

const FILENAME_PATTERN = /filename="([^"]+)"/;

function fileNameFrom(header: string | null, fallback: string): string {
  const matched = header ? FILENAME_PATTERN.exec(header) : null;
  return matched?.[1] ?? fallback;
}

function triggerDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export type ExportOutcome = { rowCount: number; truncated: boolean };

export function useExportDownload<E extends HasId>(store: BaseDataViewStore<E>) {
  const columnLabel = useColumnLabel();

  return useCallback(async (): Promise<ExportOutcome> => {
    const entityType = store.entityType;
    if (!entityType) throw new Error("Data view has no entity type");

    const customById = new Map(store.customColumns.map((column) => [column.id, column]));

    const columns: RequestedColumnInput[] = store.visibleColumns.map((column) => ({
      key: column.uid,
      header: customById.get(column.uid)?.label ?? columnLabel(column.uid),
    }));

    const response = await fetch(`/api/export/${entityType}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        columns,
        filters: toJS(store.filters),
        searchTerm: store.searchTerm,
        sortDescriptor: toJS(store.sortDescriptor),
        selectedIds: store.hasSelection ? Array.from(store.selectedIds) : undefined,
      }),
    });

    if (!response.ok) throw new Error(`Export failed with status ${response.status}`);

    const blob = await response.blob();
    triggerDownload(blob, fileNameFrom(response.headers.get("content-disposition"), `${entityType}.xlsx`));

    return {
      rowCount: Number(response.headers.get("x-export-row-count") ?? 0),
      truncated: response.headers.get("x-export-truncated") === "true",
    };
  }, [columnLabel, store]);
}

export function useExportAction<E extends HasId>(store: BaseDataViewStore<E>) {
  const download = useExportDownload(store);
  const t = useTranslations();

  return useCallback(async () => {
    try {
      const outcome = await download();

      toast.success(t("DataTransfer.export.success", { count: outcome.rowCount }));
      if (outcome.truncated) toast.warning(t("DataTransfer.export.truncated", { limit: EXPORT_ROW_LIMIT }));
    } catch (error) {
      toast.error(t("DataTransfer.export.failed"));
      throw error;
    }
  }, [download, t]);
}
