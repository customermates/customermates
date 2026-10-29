"use client";

import type { PreviewFile } from "./record-file-preview";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, FileVideo } from "lucide-react";

import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { downloadRecordFile, recordFileContentUrl } from "./record-file-links";

export function RecordFileVideoPreview({ file, active }: { file: PreviewFile; active: boolean }) {
  const t = useTranslations();
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = video.current;
    return () => element?.pause();
  }, []);
  useEffect(() => {
    if (!active) video.current?.pause();
  }, [active]);
  return failed ? (
    <PageState
      action={
        <Button variant="secondary" onClick={() => downloadRecordFile(file)}>
          <Download />

          {t("RecordModel.fileDownload")}
        </Button>
      }
      description={t("RecordModel.filePreviewReason.unreadable")}
      icon={FileVideo}
      state="empty"
      title={t("RecordModel.fileDocumentPreviewUnavailable")}
    />
  ) : (
    <div className="flex min-h-60 flex-1 items-center justify-center">
      <video
        ref={video}
        controls
        playsInline
        aria-label={t("RecordModel.filePreview", { name: file.name })}
        className="max-h-[70dvh] w-full rounded-md bg-muted object-contain"
        data-record-file-video=""
        preload="metadata"
        src={recordFileContentUrl(file.id)}
        onError={() => setFailed(true)}
      >
        <track kind="captions" />
      </video>
    </div>
  );
}
