"use client";

import type { DragEvent } from "react";
import type { RecordFieldView, RecordFileSummary } from "@/features/records/record-model.schema";
import type { RecordFileTransfer } from "./record-file-upload";

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppForm } from "@/components/forms/form-context";
import { FormFieldError } from "@/components/forms/form-field-error";
import { useFormFieldErrors } from "@/components/forms/use-form-field";
import { useRecordFileSize } from "@/components/records/record-file-chips";
import { openRecordFile, recordFileIcon } from "@/components/records/record-file-links";
import { AttachmentRow } from "@/app/[locale]/(protected)/inbox/components/attachment-row";
import { MAX_RECORD_FILES } from "@/features/records/record-model.schema";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";

import { sendRecordFileBytes, startRecordFileUpload } from "./record-file-upload";

type KnownFile = Pick<RecordFileSummary, "id" | "name" | "mimeType" | "size">;

type FileUpload = {
  key: string;
  file: File;
  progress: number;
  failure: string | null;
  transfer: RecordFileTransfer | null;
};

function fileIdsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

export const RecordFileInput = observer(function RecordFileInput({
  field,
  id,
  inputId,
  label,
  files = [],
}: {
  field: RecordFieldView;
  id: string;
  inputId?: string;
  label?: string | null;
  files?: RecordFileSummary[];
}) {
  const t = useTranslations();
  const store = useAppForm();
  const fileSize = useRecordFileSize();
  const picker = useRef<HTMLInputElement>(null);
  const transfers = useRef(new Set<RecordFileTransfer>());
  const [uploads, setUploads] = useState<FileUpload[]>([]);
  const [uploaded, setUploaded] = useState<KnownFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const { hasError, message } = useFormFieldErrors(id);
  const ids = fileIdsOf(store?.getValue(id));
  const disabled = !store || store.isDisabled;
  const limit = field.multiple ? MAX_RECORD_FILES : 1;
  const active = uploads.filter((upload) => !upload.failure).length;
  const full = field.multiple && ids.length + active >= limit;
  const domId = inputId ?? id;
  const errorId = `${domId}-error`;

  useEffect(() => {
    const running = transfers.current;
    return () => {
      for (const transfer of running) transfer.abort();
    };
  }, []);

  const update = (key: string, change: Partial<FileUpload>) =>
    setUploads((current) => current.map((upload) => (upload.key === key ? { ...upload, ...change } : upload)));
  const drop = (key: string) => setUploads((current) => current.filter((upload) => upload.key !== key));
  const failed = (key: string, failure: string | null) =>
    update(key, { failure: failure ?? t("RecordModel.fileUploadFailed"), transfer: null });

  const upload = async (key: string, file: File) => {
    const started = await startRecordFileUpload({ typeId: field.typeId, fieldId: field.id, file });
    if (!started.ok) {
      failed(key, started.message);
      return;
    }
    const transfer = sendRecordFileBytes(started.data.upload, file, (loaded, total) =>
      update(key, { progress: total ? loaded / total : 0 }),
    );
    transfers.current.add(transfer);
    update(key, { transfer });
    const outcome = await transfer.done;
    transfers.current.delete(transfer);
    if (!outcome.ok) {
      if (outcome.aborted) drop(key);
      else failed(key, outcome.message);
      return;
    }
    const fileId = started.data.fileId;
    setUploaded((current) => [
      ...current,
      { id: fileId, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size },
    ]);
    drop(key);
    const current = fileIdsOf(store?.getValue(id));
    store?.onChange(id, field.multiple ? [...current.filter((existing) => existing !== fileId), fileId] : [fileId]);
  };

  const add = (picked: File[]) => {
    if (disabled || !picked.length) return;
    const room = field.multiple ? Math.max(0, limit - ids.length - active) : 1;
    const accepted = picked.slice(0, room);
    const refused = picked.slice(room);
    const next = [
      ...accepted.map((file) => ({
        key: crypto.randomUUID(),
        file,
        progress: 0,
        failure: null,
        transfer: null,
      })),
      ...refused.map((file) => ({
        key: crypto.randomUUID(),
        file,
        progress: 0,
        failure: t("RecordModel.fileLimit", { count: limit }),
        transfer: null,
      })),
    ];
    if (!field.multiple) for (const upload of uploads) upload.transfer?.abort();
    setUploads((current) => [...(field.multiple ? current : []), ...next]);
    for (const entry of next) if (!entry.failure) runUserAction(() => upload(entry.key, entry.file));
  };

  const remove = (fileId: string) =>
    store?.onChange(
      id,
      ids.filter((existing) => existing !== fileId),
    );

  const details = (fileId: string) =>
    files.find((file) => file.id === fileId) ?? uploaded.find((file) => file.id === fileId);

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || full || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || full || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setDragging(false);
    add(Array.from(event.dataTransfer.files));
  };

  return (
    <div
      aria-label={label ?? field.label}
      className="space-y-1.5"
      data-record-file-input={field.id}
      id={domId}
      role="group"
    >
      {label && (
        <p className="text-xs text-muted-foreground">
          {label}

          {field.required ? <span className="text-destructive"> *</span> : null}
        </p>
      )}

      {(ids.length > 0 || uploads.length > 0) && (
        <ul className="flex flex-col gap-1.5">
          {ids.map((fileId) => {
            const file = details(fileId);
            return (
              <li key={fileId} data-record-file={fileId}>
                <AttachmentRow
                  accent="text-muted-foreground"
                  fileIcon={recordFileIcon(file?.mimeType)}
                  name={file?.name ?? t("RecordModel.fileUnavailable")}
                  removeLabel={t("RecordModel.fileRemove", { name: file?.name ?? t("RecordModel.fileUnavailable") })}
                  subtitle={file ? fileSize(file.size) : null}
                  onOpen={file ? () => openRecordFile(file) : undefined}
                  onRemove={disabled ? undefined : () => remove(fileId)}
                />
              </li>
            );
          })}

          {uploads.map((entry) => (
            <li key={entry.key} className="space-y-1" data-record-file-upload={entry.failure ? "failed" : "uploading"}>
              <AttachmentRow
                accent={entry.failure ? "text-destructive" : "text-muted-foreground"}
                className={cn(entry.failure && "border-destructive/30 bg-destructive/10")}
                fileIcon={recordFileIcon(entry.file.type)}
                name={entry.file.name}
                removeLabel={
                  entry.failure
                    ? t("RecordModel.fileRemove", { name: entry.file.name })
                    : t("RecordModel.fileCancelUpload", { name: entry.file.name })
                }
                subtitle={entry.failure ?? t("RecordModel.fileUploading", { progress: entry.progress })}
                onRemove={() => {
                  if (entry.transfer) entry.transfer.abort();
                  else drop(entry.key);
                }}
              />

              {!entry.failure && (
                <div
                  aria-label={t("RecordModel.fileUploading", { progress: entry.progress })}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={Math.round(entry.progress * 100)}
                  className="h-1 overflow-hidden rounded-full bg-primary/15"
                  role="progressbar"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
                    style={{ width: `${Math.round(entry.progress * 100)}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2 transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border",
          )}
          data-dragging={dragging || undefined}
          onDragLeave={() => setDragging(false)}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <input
            ref={picker}
            aria-hidden="true"
            className="hidden"
            multiple={field.multiple}
            tabIndex={-1}
            type="file"
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? []);
              event.target.value = "";
              add(picked);
            }}
          />

          <Button
            aria-describedby={hasError ? errorId : undefined}
            aria-invalid={hasError}
            disabled={full}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => picker.current?.click()}
          >
            <Upload aria-hidden />

            {t("RecordModel.fileAdd", { mode: field.multiple ? "many" : "one" })}
          </Button>

          <span className="text-xs text-muted-foreground">
            {full
              ? t("RecordModel.fileLimit", { count: limit })
              : t("RecordModel.fileDropHint", { mode: field.multiple ? "many" : "one" })}
          </span>
        </div>
      )}

      {hasError && message && <FormFieldError id={errorId}>{message}</FormFieldError>}
    </div>
  );
});
