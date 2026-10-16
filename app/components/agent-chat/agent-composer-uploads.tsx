"use client";

import type { DragEvent } from "react";

import { AlertCircle, Loader2, X } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { AppChip } from "@/components/chip/app-chip";

import { useAgentChatStore } from "./agent-chat-store-context";

export function useAgentFileDrop(enabled: boolean, onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const takes = (event: DragEvent<HTMLElement>) => enabled && event.dataTransfer.types.includes("Files");
  return {
    dragging: enabled && dragging,
    handlers: {
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!takes(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDragging(true);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        setDragging(false);
        if (!takes(event)) return;
        event.preventDefault();
        onFiles(Array.from(event.dataTransfer.files));
      },
    },
  };
}

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
            className="me-1.5 my-px h-5 max-w-full px-[5px] py-0 align-middle text-sm leading-5 font-normal"
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

                <button
                  aria-label={
                    failed
                      ? t("RecordModel.fileRemove", { name: upload.name })
                      : t("RecordModel.fileCancelUpload", { name: upload.name })
                  }
                  className="-mr-0.5 grid size-3.5 shrink-0 place-items-center rounded-sm text-current/60 outline-hidden transition-colors hover:bg-foreground/10 hover:text-current focus-visible:ring-2 focus-visible:ring-ring"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    store.removeComposerUpload(upload.key);
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                >
                  <X aria-hidden className="size-2.5" />
                </button>
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
            tooltip={status}
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
