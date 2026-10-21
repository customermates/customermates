"use client";

import type { RecordFileSummary } from "@/features/records/record-model.schema";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download, FileText } from "lucide-react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppModal, AppModalTitle } from "@/components/modal/app-modal";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { LazyMedia } from "@/app/[locale]/(protected)/inbox/components/lazy-media";
import { INLINE_RECORD_FILE_TYPES } from "@/features/record-files/record-file-response";
import { downloadRecordFile, openRecordFile, recordFileContentUrl } from "./record-file-links";

type PreviewFile = Pick<RecordFileSummary, "id" | "name" | "mimeType">;
type Selection = { file: PreviewFile; opener: HTMLElement | null };

function RecordFilePreview({ file, opener, onClose }: Selection & { onClose: () => void }) {
  const t = useTranslations();
  const src = recordFileContentUrl(file.id);
  const [canPreviewPdf] = useState(() => typeof navigator !== "undefined" && navigator.pdfViewerEnabled === true);
  return (
    <AppModal
      open
      sheet
      titleInContent
      actions={[
        {
          id: "download-file",
          icon: Download,
          label: t("RecordModel.fileDownload"),
          onClick: () => downloadRecordFile(file),
        },
      ]}
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      focusReturnTarget={opener}
      size="5xl"
      title={file.name}
      onClose={onClose}
    >
      <AppCard className="flex min-h-0 flex-1 flex-col">
        <AppCardHeader>
          <AppModalTitle className="min-w-0 wrap-anywhere text-base font-semibold">{file.name}</AppModalTitle>
        </AppCardHeader>

        <AppCardBody>
          {file.mimeType === "application/pdf" && !canPreviewPdf ? (
            <PageState
              action={
                <Button variant="secondary" onClick={() => downloadRecordFile(file)}>
                  <Download />

                  {t("RecordModel.fileDownload")}
                </Button>
              }
              description={t("RecordModel.filePreviewUnavailableDescription")}
              icon={FileText}
              state="empty"
              title={t("RecordModel.filePreviewUnavailable")}
            />
          ) : file.mimeType === "application/pdf" ? (
            <iframe
              className="min-h-[60dvh] w-full flex-1 rounded-lg border bg-muted/30"
              src={src}
              title={t("RecordModel.filePreview", { name: file.name })}
            />
          ) : (
            <LazyMedia
              className="flex min-h-60 w-full flex-1 items-center justify-center rounded-lg bg-muted/30"
              src={src}
            >
              {(onLoaded, onFailed) => (
                // eslint-disable-next-line @next/next/no-img-element -- authenticated file stream; an image proxy cannot forward the session
                <img
                  alt={file.name}
                  className="max-h-[75dvh] max-w-full object-contain"
                  src={src}
                  onError={onFailed}
                  onLoad={onLoaded}
                />
              )}
            </LazyMedia>
          )}
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
}

export function useRecordFilePreview() {
  const [selection, setSelection] = useState<Selection | null>(null);
  return {
    openFile: (file: PreviewFile, opener?: HTMLElement | null) => {
      if (!INLINE_RECORD_FILE_TYPES.has(file.mimeType)) {
        openRecordFile(file);
        return;
      }
      setSelection({
        file,
        opener: opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null),
      });
    },
    preview: selection ? (
      <RecordFilePreview key={selection.file.id} {...selection} onClose={() => setSelection(null)} />
    ) : null,
  };
}
