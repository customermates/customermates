"use client";

import type { ImageSize } from "@/components/files/file-type-badge";
import type { PreviewFile } from "@/components/records/record-file-preview";
import type { RecordFieldView, RecordFileSummary, RecordMember } from "@/features/records/record-model.schema";

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Download, ExternalLink, Pencil, Plus, X } from "lucide-react";

import { FileTypeBadge } from "@/components/files/file-type-badge";
import { useAppForm } from "@/components/forms/form-context";
import { FormFieldError } from "@/components/forms/form-field-error";
import { FormLabel } from "@/components/forms/form-label";
import { useFormFieldErrors } from "@/components/forms/use-form-field";
import { downloadRecordFile, recordFileContentUrl } from "@/components/records/record-file-links";
import { uploaderNameOf, useRecordFileMeta } from "@/components/records/record-file-meta";
import { RecordFileNameInput } from "@/components/records/record-file-name-input";
import { useRecordFilePreview } from "@/components/records/record-file-preview";
import { useRecordFileRename } from "@/components/records/record-file-rename";
import { startRecordFileUpload } from "@/components/records/record-file-upload";
import { type RecordFileUpload, RecordFileUploadQueue } from "@/components/records/record-file-upload-queue";
import { useFileDrop } from "@/components/shared/use-file-drop";
import { WizardProgress } from "@/components/shared/wizard-progress";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { ItemActions, ItemActionsTrigger, ITEM_ACTIONS_TRIGGER_CLASS } from "@/components/ui/item-actions";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { INLINE_RECORD_FILE_TYPES } from "@/features/record-files/record-file-response";
import { MAX_RECORD_FILES } from "@/features/records/record-model.schema";

type KnownFile = PreviewFile;
type Member = Pick<RecordMember, "id" | "firstName" | "lastName">;

const ROW_CLASS = "relative flex min-h-12 items-center gap-3 px-3 py-2";
const TOUCH_VISIBLE_CLASS = "touch-input:not-focus-visible:not-data-[state=open]:not-sr-only touch-input:opacity-100";

function fileIdsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

const RecordFileRow = observer(function RecordFileRow({
  fileId,
  file,
  readOnly,
  uploaderName,
  onOpen,
  onRemove,
  onRename,
}: {
  fileId: string;
  file: KnownFile | undefined;
  readOnly: boolean;
  uploaderName: (userId: string) => string | null;
  onOpen: (opener: HTMLElement) => void;
  onRemove: () => void;
  onRename: (name: string) => void;
}) {
  const t = useTranslations();
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [editing, setEditing] = useState(false);
  const renameRequested = useRef(false);
  const nameButton = useRef<HTMLButtonElement>(null);
  const meta = useRecordFileMeta(file, { uploaderName, imageSize });
  const name = file?.name ?? t("RecordModel.fileUnavailable");
  const inline = file ? INLINE_RECORD_FILE_TYPES.has(file.mimeType) : false;
  const menu = file && (
    <>
      {!readOnly && (
        <DropdownMenuItem
          onSelect={() => {
            renameRequested.current = true;
          }}
        >
          <Pencil aria-hidden />

          {t("RecordModel.fileRename", { name: file.name })}
        </DropdownMenuItem>
      )}

      {inline && (
        <DropdownMenuItem asChild>
          <a href={recordFileContentUrl(file.id)} rel="noopener noreferrer" target="_blank">
            <ExternalLink aria-hidden />

            {t("Common.actions.openInNewTab")}
          </a>
        </DropdownMenuItem>
      )}

      <DropdownMenuItem onSelect={() => downloadRecordFile(file)}>
        <Download aria-hidden />

        {t("RecordModel.fileDownload")}
      </DropdownMenuItem>

      {!readOnly && (
        <>
          <DropdownMenuSeparator />

          <DropdownMenuItem variant="destructive" onSelect={onRemove}>
            <X aria-hidden />

            {t("RecordModel.fileRemove", { name: file.name })}
          </DropdownMenuItem>
        </>
      )}
    </>
  );
  return (
    <li data-record-file={fileId} data-record-file-kind={file ? undefined : "unavailable"}>
      <ItemActions
        label={name}
        menu={menu}
        onCloseAutoFocus={(event) => {
          if (!renameRequested.current) return;
          renameRequested.current = false;
          event.preventDefault();
          setEditing(true);
        }}
      >
        <div className={cn(ROW_CLASS, file && "transition-colors hover:bg-foreground/5")}>
          <FileTypeBadge
            mimeType={file?.mimeType}
            name={file?.name}
            thumbnailSrc={file && inline ? recordFileContentUrl(file.id) : null}
            onImageSize={setImageSize}
          />

          <div className="min-w-0 flex-1">
            {file && editing ? (
              <RecordFileNameInput
                label={t("RecordModel.fileNameLabel")}
                name={file.name}
                onDone={(value) => {
                  setEditing(false);
                  if (value !== null) onRename(value);
                  requestAnimationFrame(() => nameButton.current?.focus());
                }}
              />
            ) : file ? (
              <button
                ref={nameButton}
                className="block w-full truncate text-left text-sm font-medium outline-none before:absolute before:inset-0 before:rounded-[inherit] focus-visible:before:ring-2 focus-visible:before:ring-ring/70 focus-visible:before:ring-inset"
                data-record-file-name=""
                type="button"
                onClick={(event) => onOpen(event.currentTarget)}
              >
                {name}
              </button>
            ) : (
              <span className="block truncate text-sm text-muted-foreground" data-record-file-name="">
                {name}
              </span>
            )}

            {meta && !editing && (
              <p className="truncate text-xs text-muted-foreground" data-record-file-meta="">
                {meta}
              </p>
            )}
          </div>

          {file ? (
            <div className="relative flex shrink-0 items-center gap-0.5">
              <IconButton
                className={cn(ITEM_ACTIONS_TRIGGER_CLASS, TOUCH_VISIBLE_CLASS)}
                icon={Download}
                label={t("RecordModel.fileDownloadNamed", { name: file.name })}
                onClick={() => downloadRecordFile(file)}
              />

              <ItemActionsTrigger className={TOUCH_VISIBLE_CLASS} label={t("RecordModel.moreActions", { name })} />
            </div>
          ) : (
            !readOnly && (
              <IconButton
                className="relative"
                icon={X}
                label={t("RecordModel.fileRemove", { name })}
                onClick={onRemove}
              />
            )
          )}
        </div>
      </ItemActions>
    </li>
  );
});

function UploadRow({ entry, onRemove }: { entry: RecordFileUpload; onRemove: () => void }) {
  const t = useTranslations();
  const failed = entry.phase === "failed";
  const progress = t("RecordModel.fileUploading", { progress: entry.progress });
  return (
    <li
      className={cn(ROW_CLASS, failed && "bg-destructive/5")}
      data-record-file-upload={failed ? "failed" : "uploading"}
    >
      <FileTypeBadge className={cn(!failed && "opacity-60")} mimeType={entry.mimeType} name={entry.name} />

      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium" data-record-file-name="">
          {entry.name}
        </p>

        {failed ? (
          <p className="truncate text-xs text-destructive" data-record-file-meta="">
            {entry.failure}
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground tabular-nums">{progress}</p>

            <WizardProgress
              current={Math.round(entry.progress * 100)}
              label={progress}
              min={0}
              total={100}
              valueText={progress}
            />
          </>
        )}
      </div>

      <IconButton
        icon={X}
        label={
          failed
            ? t("RecordModel.fileRemove", { name: entry.name })
            : t("RecordModel.fileCancelUpload", { name: entry.name })
        }
        onClick={onRemove}
      />
    </li>
  );
}

export const RecordFileCount = observer(function RecordFileCount({ id }: { id: string }) {
  const count = fileIdsOf(useAppForm()?.getValue(id)).length;
  return count > 0 ? (
    <span className="ml-1.5 font-normal text-muted-foreground tabular-nums" data-record-file-count="">
      {count}
    </span>
  ) : null;
});

export const RecordFileInput = observer(function RecordFileInput({
  field,
  id,
  inputId,
  label,
  files = [],
  members = [],
  flush = false,
}: {
  field: RecordFieldView;
  id: string;
  inputId?: string;
  label?: string | null;
  files?: RecordFileSummary[];
  members?: Member[];
  flush?: boolean;
}) {
  const t = useTranslations();
  const store = useAppForm();
  const root = useRootStore();
  const readOnly = !store || store.isDisabled;
  const renaming = useRecordFileRename();
  const { openFiles, preview } = useRecordFilePreview({ rename: readOnly ? undefined : renaming });
  const picker = useRef<HTMLInputElement>(null);
  const [queue] = useState(() => new RecordFileUploadQueue());
  const [uploaded, setUploaded] = useState<KnownFile[]>([]);
  const { hasError, message } = useFormFieldErrors(id);
  const ids = fileIdsOf(store?.getValue(id));
  const limit = field.multiple ? MAX_RECORD_FILES : 1;
  const full = field.multiple && ids.length + queue.pending >= limit;
  const domId = inputId ?? id;
  const errorId = `${domId}-error`;
  const fieldLabel = label ?? field.label;
  const viewer = root.userStore.user;
  const uploaderName = uploaderNameOf(
    viewer && !members.some((member) => member.id === viewer.id) ? [...members, viewer] : members,
  );

  useEffect(() => () => queue.clear(), [queue]);

  const add = (picked: File[]) => {
    if (readOnly || !picked.length) return;
    if (!field.multiple) queue.clear();
    queue.add(picked, {
      room: field.multiple ? Math.max(0, limit - ids.length - queue.pending) : 1,
      refusal: t("RecordModel.fileLimit", { count: limit }),
      failure: t("RecordModel.fileUploadFailed"),
      start: (file) => startRecordFileUpload({ typeId: field.typeId, fieldId: field.id, file }),
      complete: (fileId, file) =>
        Promise.resolve({
          ok: true as const,
          data: {
            id: fileId,
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            uploadedAt: new Date().toISOString(),
            uploadedById: viewer?.id ?? null,
          },
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

  const details = (fileId: string) => {
    const file = files.find((entry) => entry.id === fileId) ?? uploaded.find((entry) => entry.id === fileId);
    return file && { ...file, name: renaming.nameOf(file) };
  };
  const known = ids.flatMap((fileId) => {
    const file = details(fileId);
    return file ? [file] : [];
  });

  const fileDrop = useFileDrop(!readOnly && !full, add);
  const hasRows = ids.length > 0 || queue.uploads.length > 0;

  return (
    <div aria-label={fieldLabel} className="space-y-1.5" data-record-file-input={field.id} id={domId} role="group">
      {label && (
        <FormLabel fieldId={id}>
          {label}

          <RecordFileCount id={id} />

          {field.required && <span className="text-destructive"> *</span>}
        </FormLabel>
      )}

      {(hasRows || !readOnly) && (
        <div
          className={cn(
            "relative overflow-hidden transition-[border-color,box-shadow]",
            !flush && "rounded-lg border bg-input-background",
            fileDrop.dragging && "border border-dashed border-primary ring-2 ring-primary/20",
          )}
          data-dragging={fileDrop.dragging || undefined}
          {...fileDrop.handlers}
        >
          <ul className="divide-y">
            {ids.map((fileId) => (
              <RecordFileRow
                key={fileId}
                file={details(fileId)}
                fileId={fileId}
                readOnly={readOnly}
                uploaderName={uploaderName}
                onOpen={(opener) => {
                  const index = known.findIndex((file) => file.id === fileId);
                  if (index >= 0) openFiles({ files: known, index, group: fieldLabel, uploaderName }, opener);
                }}
                onRemove={() => remove(fileId)}
                onRename={(name) => {
                  const file = details(fileId);
                  if (file) runUserAction(() => renaming.rename(file, name));
                }}
              />
            ))}

            {queue.uploads.map((entry) => (
              <UploadRow key={entry.key} entry={entry} onRemove={() => queue.remove(entry.key)} />
            ))}

            {!readOnly && (
              <li>
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

                {full ? (
                  <p className={cn(ROW_CLASS, "min-h-10 text-xs text-muted-foreground")}>
                    {t("RecordModel.fileLimit", { count: limit })}
                  </p>
                ) : (
                  <button
                    aria-describedby={hasError ? errorId : undefined}
                    className={cn(
                      ROW_CLASS,
                      "min-h-10 w-full text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-inset",
                    )}
                    data-record-file-add=""
                    type="button"
                    onClick={() => picker.current?.click()}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center">
                      <Plus aria-hidden className="size-4" />
                    </span>

                    {t("RecordModel.fileAddRow", { mode: field.multiple ? "many" : "one" })}
                  </button>
                )}
              </li>
            )}
          </ul>

          {fileDrop.dragging && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/85 text-sm font-medium text-primary backdrop-blur-[1px]"
              data-record-file-drop-overlay=""
            >
              {t("RecordModel.fileDropOverlay", { field: fieldLabel })}
            </div>
          )}
        </div>
      )}

      {hasError && message && <FormFieldError id={errorId}>{message}</FormFieldError>}

      {preview}
    </div>
  );
});
