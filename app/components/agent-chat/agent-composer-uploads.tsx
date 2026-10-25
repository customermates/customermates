"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";

import { useAgentChatStore } from "./agent-chat-store-context";
import { AGENT_COMPOSER_CHIP_CLASS, AgentComposerChipRemove } from "./agent-composer-chip";

export function AgentFileDropOverlay() {
  const t = useTranslations();
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-primary bg-background/90 p-6 text-center text-sm font-medium text-primary"
      data-testid="agent-file-drop-overlay"
    >
      {t("AgentChat.files.dropHint")}
    </div>
  );
}

export const AgentComposerUploads = observer(function AgentComposerUploads() {
  const store = useAgentChatStore();
  const t = useTranslations();
  if (store.composerUploads.length === 0) return null;

  return (
    <span className="contents" data-testid="agent-composer-uploads">
      {store.composerUploads.map((upload) => {
        const failed = upload.phase === "failed";
        const status = failed
          ? (upload.failure ?? t("RecordModel.fileUploadFailed"))
          : upload.phase === "reading"
            ? t("AgentChat.files.reading")
            : t("RecordModel.fileUploading", { progress: upload.progress });
        return (
          <AppChip
            key={upload.key}
            className={AGENT_COMPOSER_CHIP_CLASS}
            data-agent-upload={upload.phase}
            endContent={
              <>
                {!failed && (
                  <span
                    aria-label={status}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={Math.round(upload.progress * 100)}
                    className="shrink-0 text-current/60 tabular-nums"
                    role="progressbar"
                  >
                    {upload.phase === "reading"
                      ? t("AgentChat.files.reading")
                      : `${Math.round(upload.progress * 100)}%`}
                  </span>
                )}

                <AgentComposerChipRemove
                  label={
                    failed
                      ? t("RecordModel.fileRemove", { name: upload.name })
                      : t("RecordModel.fileCancelUpload", { name: upload.name })
                  }
                  onRemove={() => store.removeComposerUpload(upload.key)}
                />
              </>
            }
            size="sm"
            startContent={
              failed ? (
                <AlertCircle aria-hidden className="size-3 shrink-0" />
              ) : (
                <Loader2 aria-hidden className="size-3 shrink-0 animate-spin motion-reduce:animate-none" />
              )
            }
            variant={failed ? "destructive" : "secondary"}
          >
            {upload.name}
          </AppChip>
        );
      })}
    </span>
  );
});

export const AgentComposerUploadErrors = observer(function AgentComposerUploadErrors() {
  const store = useAgentChatStore();
  const t = useTranslations();
  const failed = store.composerUploads.filter((upload) => upload.phase === "failed");
  if (failed.length === 0) return null;

  return (
    <ul
      className="mt-1.5 space-y-0.5 px-1 text-xs text-destructive"
      data-testid="agent-composer-upload-errors"
      role="alert"
    >
      {failed.map((upload) => (
        <li key={upload.key} className="break-words">
          {t("AgentChat.files.failed", {
            name: upload.name,
            message: upload.failure ?? t("RecordModel.fileUploadFailed"),
          })}
        </li>
      ))}
    </ul>
  );
});
