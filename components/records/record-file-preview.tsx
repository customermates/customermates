"use client";

import type { ImageSize } from "@/components/files/file-type-badge";
import type { RecordFileSummary } from "@/features/records/record-model.schema";

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Pencil } from "lucide-react";

import { FileTypeBadge } from "@/components/files/file-type-badge";
import { fileKind } from "@/components/files/file-kind";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppModal, AppModalTitle } from "@/components/modal/app-modal";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import { INLINE_RECORD_FILE_TYPES } from "@/features/record-files/record-file-response";
import { recordFilePreviewFormat } from "@/features/record-files/record-file-preview.schema";

import { downloadRecordFile, recordFileContentUrl } from "./record-file-links";
import { RecordFileDocumentPreview } from "./record-file-document-preview";
import { RecordFileNameInput } from "./record-file-name-input";
import { type RecordFileRename } from "./record-file-rename";
import { useRecordFileMeta } from "./record-file-meta";

export type PreviewFile = Pick<RecordFileSummary, "id" | "name" | "mimeType"> &
  Partial<Pick<RecordFileSummary, "size" | "uploadedAt" | "uploadedById" | "pageCount">>;

export type RecordFileSet = {
  files: PreviewFile[];
  index: number;
  group?: string | null;
  uploaderName?: (userId: string) => string | null;
};

type Selection = RecordFileSet & { opener: HTMLElement | null; open: boolean; opening: number };

function stepsWithin(target: EventTarget) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        'input, textarea, select, [contenteditable="true"], [role="tablist"], [data-slot="table-container"]',
      ),
    )
  );
}

function canShowPdf() {
  return typeof navigator === "undefined" || navigator.pdfViewerEnabled !== false;
}

const RecordFilePreview = observer(function RecordFilePreview({
  files,
  index: initial,
  group,
  uploaderName,
  opener,
  open,
  layerClassName,
  rename,
  onClose,
}: Selection & { layerClassName?: string; rename?: RecordFileRename; onClose: () => void }) {
  const t = useTranslations();
  const [index, setIndex] = useState(Math.min(Math.max(initial, 0), files.length - 1));
  const [imageSize, setImageSize] = useState<{ id: string; size: ImageSize } | null>(null);
  const [showPdf] = useState(canShowPdf);
  const [editing, setEditing] = useState(false);
  const shown = files[index];
  const file = rename ? { ...shown, name: rename.nameOf(shown) } : shown;
  const meta = useRecordFileMeta(file, {
    uploaderName,
    imageSize: imageSize?.id === file.id ? imageSize.size : null,
    withType: true,
  });
  const src = recordFileContentUrl(file.id);
  const kind = fileKind(file.mimeType, file.name);
  const inline = INLINE_RECORD_FILE_TYPES.has(file.mimeType);
  const count = files.length;
  const many = count > 1;
  const step = (delta: number) => setIndex((current) => (current + delta + count) % count);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !many) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const dialog = body.current?.closest('[role="dialog"]');
      if (!(event.target instanceof Node) || !dialog?.contains(event.target) || stepsWithin(event.target)) return;
      event.preventDefault();
      const delta = event.key === "ArrowLeft" ? -1 : 1;
      setIndex((current) => (current + delta + count) % count);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, many, count]);
  const actions = [
    ...(many
      ? [
          { id: "previous-file", icon: ChevronLeft, label: t("RecordModel.filePrevious"), onClick: () => step(-1) },
          { id: "next-file", icon: ChevronRight, label: t("RecordModel.fileNext"), onClick: () => step(1) },
        ]
      : []),
    ...(inline
      ? [
          {
            id: "open-file",
            icon: ExternalLink,
            label: t("Common.actions.openInNewTab"),
            href: src,
            external: true as const,
          },
        ]
      : []),
    ...(rename
      ? [
          {
            id: "rename-file",
            icon: Pencil,
            label: t("RecordModel.fileRename", { name: file.name }),
            onClick: () => setEditing(true),
          },
        ]
      : []),
    {
      id: "download-file",
      icon: Download,
      label: t("RecordModel.fileDownload"),
      onClick: () => downloadRecordFile(file),
    },
  ];
  return (
    <AppModal
      sheet
      titleInContent
      actions={actions}
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      focusReturnTarget={opener}
      layerClassName={layerClassName}
      open={open}
      size="5xl"
      title={file.name}
      onClose={onClose}
    >
      <div
        ref={body}
        className="flex min-h-0 flex-1 flex-col"
        data-record-file-preview-file={file.id}
        data-record-file-preview-kind={kind}
      >
        <AppCardHeader className="gap-3 pb-4">
          <FileTypeBadge mimeType={file.mimeType} name={file.name} />

          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <AppModalTitle className={cn("w-full truncate text-lg font-semibold", editing && rename && "sr-only")}>
              {file.name}
            </AppModalTitle>

            {editing && rename && (
              <RecordFileNameInput
                key={file.id}
                appearance="heading"
                label={t("RecordModel.fileNameLabel")}
                name={file.name}
                onDone={(value) => {
                  setEditing(false);
                  if (value !== null) runUserAction(() => rename.rename(shown, value));
                }}
              />
            )}

            {many && (
              <p
                aria-live="polite"
                className="w-full truncate text-sm text-muted-foreground"
                data-record-file-position=""
              >
                {group
                  ? t("RecordModel.filePositionIn", { position: index + 1, count: files.length, group })
                  : t("RecordModel.filePosition", { position: index + 1, count: files.length })}
              </p>
            )}
          </div>
        </AppCardHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-auto border-t bg-muted/30 px-6 py-4">
          {recordFilePreviewFormat(file.mimeType, file.name) ? (
            <RecordFileDocumentPreview key={file.id} file={file} />
          ) : kind === "pdf" && inline && showPdf ? (
            <iframe
              key={file.id}
              className="min-h-[60dvh] w-full flex-1 rounded-lg border bg-background"
              data-record-file-pdf=""
              src={src}
              title={t("RecordModel.filePreview", { name: file.name })}
            />
          ) : kind === "image" && inline ? (
            <div className="flex min-h-60 flex-1 items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated file stream; an image proxy cannot forward the session */}
              <img
                key={file.id}
                alt={file.name}
                className="max-h-[70dvh] max-w-full rounded-md object-contain shadow-sm"
                src={src}
                onLoad={(event) =>
                  setImageSize({
                    id: file.id,
                    size: { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight },
                  })
                }
              />
            </div>
          ) : (
            <PageState
              action={
                <Button variant="secondary" onClick={() => downloadRecordFile(file)}>
                  <Download />

                  {t("RecordModel.fileDownload")}
                </Button>
              }
              description={
                kind === "pdf"
                  ? t("RecordModel.filePreviewUnavailableDescription")
                  : t("RecordModel.filePreviewReason.unsupported")
              }
              icon={FileText}
              state="empty"
              title={
                kind === "pdf"
                  ? t("RecordModel.filePreviewUnavailable")
                  : t("RecordModel.fileDocumentPreviewUnavailable")
              }
            />
          )}
        </div>

        {meta && (
          <footer
            className="shrink-0 truncate px-6 py-3 text-xs text-muted-foreground"
            data-record-file-preview-meta=""
          >
            {meta}
          </footer>
        )}
      </div>
    </AppModal>
  );
});

export function useRecordFilePreview({
  layerClassName,
  rename,
}: { layerClassName?: string; rename?: RecordFileRename } = {}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  return {
    openFiles: (set: RecordFileSet, opener?: HTMLElement | null) => {
      if (!set.files.length) return;
      setSelection((current) => ({
        ...set,
        opener: opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null),
        open: true,
        opening: (current?.opening ?? 0) + 1,
      }));
    },
    preview: selection ? (
      <RecordFilePreview
        key={selection.opening}
        {...selection}
        layerClassName={layerClassName}
        rename={rename}
        onClose={() => setSelection((current) => current && { ...current, open: false })}
      />
    ) : null,
  };
}
