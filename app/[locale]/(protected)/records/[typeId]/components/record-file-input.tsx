"use client";

import type { RecordFieldView, RecordFileSummary } from "@/features/records/record-model.schema";

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Download, Eye, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ItemActions, ItemActionsTrigger } from "@/components/ui/item-actions";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useAppForm } from "@/components/forms/form-context";
import { FormFieldError } from "@/components/forms/form-field-error";
import { FormLabel } from "@/components/forms/form-label";
import { useFormFieldErrors } from "@/components/forms/use-form-field";
import { downloadRecordFile } from "@/components/records/record-file-links";
import { useRecordFilePreview } from "@/components/records/record-file-preview";
import { startRecordFileUpload } from "@/components/records/record-file-upload";
import { RecordFileUploadQueue } from "@/components/records/record-file-upload-queue";
import { useFileDrop } from "@/components/shared/use-file-drop";
import { WizardProgress } from "@/components/shared/wizard-progress";
import { AttachmentRow } from "@/app/[locale]/(protected)/inbox/components/attachment-row";
import { attachmentSubtitle, describeFile } from "@/app/[locale]/(protected)/inbox/components/attachment-classify";
import { MAX_RECORD_FILES } from "@/features/records/record-model.schema";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { cn } from "@/core/utils/cn";

type KnownFile = Pick<RecordFileSummary, "id" | "name" | "mimeType" | "size">;

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
  const intlStore = useHydratedIntlStore();
  const { openFile, preview } = useRecordFilePreview();
  const picker = useRef<HTMLInputElement>(null);
  const [queue] = useState(() => new RecordFileUploadQueue());
  const [uploaded, setUploaded] = useState<KnownFile[]>([]);
  const { hasError, message } = useFormFieldErrors(id);
  const ids = fileIdsOf(store?.getValue(id));
  const disabled = !store || store.isDisabled;
  const limit = field.multiple ? MAX_RECORD_FILES : 1;
  const full = field.multiple && ids.length + queue.pending >= limit;
  const domId = inputId ?? id;
  const errorId = `${domId}-error`;

  useEffect(() => () => queue.clear(), [queue]);

  const add = (picked: File[]) => {
    if (disabled || !picked.length) return;
    if (!field.multiple) queue.clear();
    queue.add(picked, {
      room: field.multiple ? Math.max(0, limit - ids.length - queue.pending) : 1,
      refusal: t("RecordModel.fileLimit", { count: limit }),
      failure: t("RecordModel.fileUploadFailed"),
      start: (file) => startRecordFileUpload({ typeId: field.typeId, fieldId: field.id, file }),
      complete: (fileId, file) =>
        Promise.resolve({
          ok: true as const,
          data: { id: fileId, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size },
        }),
      completed: (file: KnownFile) => {
        setUploaded((known) => [...known, file]);
        const values = fileIdsOf(store?.getValue(id));
        store?.onChange(
          id,
          field.multiple ? [...values.filter((existing) => existing !== file.id), file.id] : [file.id],
        );
      },
    });
  };

  const remove = (fileId: string) =>
    store?.onChange(
      id,
      ids.filter((existing) => existing !== fileId),
    );

  const details = (fileId: string) =>
    files.find((file) => file.id === fileId) ?? uploaded.find((file) => file.id === fileId);

  const fileDrop = useFileDrop(!disabled && !full, add);
  const subtitle = (file: KnownFile) =>
    attachmentSubtitle(t, { mime: file.mimeType, fileName: file.name, size: file.size }, (value, options) =>
      intlStore.formatNumber(value, options),
    );

  return (
    <div
      aria-label={label ?? field.label}
      className="space-y-1.5"
      data-record-file-input={field.id}
      id={domId}
      role="group"
    >
      {label && (
        <FormLabel fieldId={id}>
          {label}

          {field.required && <span className="text-destructive"> *</span>}
        </FormLabel>
      )}

      {(ids.length > 0 || queue.uploads.length > 0) && (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ids.map((fileId) => {
            const file = details(fileId);
            return (
              <li key={fileId} data-record-file={fileId}>
                <ItemActions
                  label={file?.name ?? t("RecordModel.fileUnavailable")}
                  menu={
                    file && (
                      <>
                        <DropdownMenuItem onSelect={() => openFile(file)}>
                          <Eye aria-hidden />

                          {t("RecordModel.filePreview", { name: file.name })}
                        </DropdownMenuItem>

                        <DropdownMenuItem onSelect={() => downloadRecordFile(file)}>
                          <Download aria-hidden />

                          {t("RecordModel.fileDownload")}
                        </DropdownMenuItem>

                        {!disabled && (
                          <DropdownMenuItem onSelect={() => remove(fileId)}>
                            <X aria-hidden />

                            {t("RecordModel.fileRemove", { name: file.name })}
                          </DropdownMenuItem>
                        )}
                      </>
                    )
                  }
                >
                  <div>
                    <AttachmentRow
                      accent="text-muted-foreground"
                      actions={
                        file ? (
                          <ItemActionsTrigger
                            className="touch-input:not-focus-visible:not-data-[state=open]:not-sr-only touch-input:opacity-100"
                            label={t("RecordModel.moreActions", { name: file.name })}
                          />
                        ) : undefined
                      }
                      fileIcon={describeFile({ mime: file?.mimeType, fileName: file?.name }).Icon}
                      name={file?.name ?? t("RecordModel.fileUnavailable")}
                      subtitle={file ? subtitle(file) : null}
                      tone="neutral"
                      onOpen={file ? () => openFile(file) : undefined}
                    />
                  </div>
                </ItemActions>
              </li>
            );
          })}

          {queue.uploads.map((entry) => {
            const failed = entry.phase === "failed";
            return (
              <li key={entry.key} className="space-y-1" data-record-file-upload={failed ? "failed" : "uploading"}>
                <AttachmentRow
                  accent={failed ? "text-destructive" : "text-muted-foreground"}
                  className={cn(failed && "border-destructive/30 bg-destructive/10")}
                  fileIcon={describeFile({ mime: entry.mimeType, fileName: entry.name }).Icon}
                  name={entry.name}
                  removeLabel={
                    failed
                      ? t("RecordModel.fileRemove", { name: entry.name })
                      : t("RecordModel.fileCancelUpload", { name: entry.name })
                  }
                  subtitle={failed ? entry.failure : t("RecordModel.fileUploading", { progress: entry.progress })}
                  tone="neutral"
                  onRemove={() => queue.remove(entry.key)}
                />

                {!failed && (
                  <WizardProgress
                    current={Math.round(entry.progress * 100)}
                    label={t("RecordModel.fileUploading", { progress: entry.progress })}
                    min={0}
                    total={100}
                    valueText={t("RecordModel.fileUploading", { progress: entry.progress })}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!disabled && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2 transition-colors",
            fileDrop.dragging ? "border-primary bg-primary/5" : "border-border",
          )}
          data-dragging={fileDrop.dragging || undefined}
          {...fileDrop.handlers}
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

      {preview}
    </div>
  );
});
