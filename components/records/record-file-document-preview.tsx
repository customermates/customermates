"use client";

import type { RecordFilePreview } from "@/features/record-files/record-file-preview.schema";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, FileText } from "lucide-react";

import { PageState } from "@/components/page-state/page-state";
import { SkeletonShape } from "@/components/page-state/skeleton-shape";
import { Button } from "@/components/ui/button";
import { SegmentedControl, SegmentedControlPanel } from "@/components/ui/segmented-control";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isWorkspaceChangedFailure } from "@/core/errors/workspace-changed";
import { notifyWorkspaceChanged } from "@/core/errors/workspace-changed-notice";
import { cn } from "@/core/utils/cn";
import { RecordFilePreviewSchema } from "@/features/record-files/record-file-preview.schema";
import { downloadRecordFile } from "./record-file-links";

type File = { id: string; name: string };
type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: RecordFilePreview };

export function RecordFileDocumentPreview({ file }: { file: File }) {
  const t = useTranslations();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/v1/files/${encodeURIComponent(file.id)}/preview`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (response.status === 409 && isWorkspaceChangedFailure(body)) notifyWorkspaceChanged();
        if (!response.ok) throw new Error("The file preview could not be loaded");
        return RecordFilePreviewSchema.parse(body);
      })
      .then((data) => {
        if (!controller.signal.aborted) setState({ kind: "ready", data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: "error" });
      });
    return () => controller.abort();
  }, [file.id]);

  if (state.kind === "loading") {
    return (
      <PageState
        background={
          <div className="flex min-h-60 flex-col gap-3 py-3">
            <SkeletonShape animated className="h-6 w-1/3" />

            <SkeletonShape animated className="h-4 w-full" />

            <SkeletonShape animated className="h-4 w-4/5" />

            <SkeletonShape animated className="h-4 w-3/5" />
          </div>
        }
        label={t("RecordModel.filePreviewLoading")}
        state="loading"
      />
    );
  }
  if (state.kind === "error" || state.data.kind === "unavailable") {
    const reason =
      state.kind === "error" ? "unreadable" : state.data.kind === "unavailable" ? state.data.reason : "unreadable";
    const descriptions = {
      unsupported: t("RecordModel.filePreviewReason.unsupported"),
      tooLarge: t("RecordModel.filePreviewReason.tooLarge"),
      unreadable: t("RecordModel.filePreviewReason.unreadable"),
      empty: t("RecordModel.filePreviewReason.empty"),
    };
    return (
      <PageState
        action={
          <Button variant="secondary" onClick={() => downloadRecordFile(file)}>
            <Download />

            {t("RecordModel.fileDownload")}
          </Button>
        }
        description={descriptions[reason]}
        icon={FileText}
        state="empty"
        title={t("RecordModel.fileDocumentPreviewUnavailable")}
      />
    );
  }
  const preview = state.data;
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3" data-record-file-preview={preview.kind}>
      {preview.truncated ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("RecordModel.filePreviewTruncated")}
        </p>
      ) : null}

      {preview.kind === "sheets" ? (
        <SpreadsheetPreview preview={preview} />
      ) : (
        <>
          {preview.format === "docx" ? (
            <p className="text-sm text-muted-foreground">{t("RecordModel.filePreviewDocumentContent")}</p>
          ) : null}

          <pre
            className={cn(
              "min-w-0 whitespace-pre-wrap wrap-anywhere rounded-lg border bg-muted/30 p-4 text-sm",
              preview.format === "docx" ? "font-sans leading-relaxed" : "font-mono",
            )}
          >
            {preview.text}
          </pre>
        </>
      )}
    </div>
  );
}

function columnName(index: number): string {
  let name = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26))
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  return name;
}

function SpreadsheetPreview({ preview }: { preview: Extract<RecordFilePreview, { kind: "sheets" }> }) {
  const t = useTranslations();
  const id = useId();
  const [active, setActive] = useState("0");
  const sheet = preview.sheets[Number(active)] ?? preview.sheets[0];
  const width = Math.max(1, ...sheet.rows.map((row) => row.cells.length));
  return (
    <SegmentedControl
      className="min-w-0"
      idPrefix={id}
      items={preview.sheets.map((sheet, index) => ({ value: String(index), label: sheet.name }))}
      label={t("RecordModel.filePreviewSheets")}
      listClassName="flex overflow-x-auto *:max-w-48 *:shrink-0"
      value={active}
      onValueChange={setActive}
    >
      <SegmentedControlPanel key={active} className="min-w-0" value={active}>
        <Table aria-label={sheet.name}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">
                <span className="sr-only">{t("RecordModel.filePreviewRow")}</span>
              </TableHead>

              {Array.from({ length: width }, (_, index) => (
                <TableHead key={index} scope="col">
                  {columnName(index)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {sheet.rows.map((row) => (
              <TableRow key={row.number}>
                <TableHead className="text-right tabular-nums" scope="row">
                  {row.number}
                </TableHead>

                {Array.from({ length: width }, (_, index) => (
                  <TableCell key={index} className="min-w-24 max-w-80 whitespace-pre-wrap wrap-anywhere">
                    {row.cells[index] ?? ""}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SegmentedControlPanel>
    </SegmentedControl>
  );
}
