"use client";

import type { RecordExportFormat } from "@/features/data-transfer/export/export-records.interactor";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";

import { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

const FILENAME_PATTERN = /filename="([^"]+)"/;

export function useRecordExport(presentation: RecordPresentationResult, format: RecordExportFormat = "json") {
  const t = useTranslations();
  const presentationRef = useRef(presentation);
  const translationRef = useRef(t);
  presentationRef.current = presentation;
  translationRef.current = t;
  return useCallback(async () => {
    try {
      const { typeId, search, filters, relatedFilters, relationships, sort } = presentationRef.current.query;
      const response = await fetch("/api/v1/records/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ typeId, search, filters, relatedFilters, relationships, sort, format }),
      });
      if (!response.ok) throw new Error(`Record export failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download =
          FILENAME_PATTERN.exec(response.headers.get("content-disposition") ?? "")?.[1] ??
          `records-${typeId}.${format}`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
      toast.success(
        translationRef.current("DataTransfer.export.success", {
          count: Number(response.headers.get("x-export-row-count") ?? 0),
        }),
      );
    } catch {
      toast.error(translationRef.current("DataTransfer.export.failed"));
    }
  }, [format]);
}
