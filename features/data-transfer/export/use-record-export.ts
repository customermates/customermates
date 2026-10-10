"use client";

import { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";

export function useRecordExport(presentation: RecordPresentationResult) {
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
        body: JSON.stringify({ typeId, search, filters, relatedFilters, relationships, sort }),
      });
      if (!response.ok) throw new Error(`Record export failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `records-${typeId}.json`;
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
  }, []);
}
