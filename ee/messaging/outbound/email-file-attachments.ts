import type { Validated } from "@/core/validation/validation.utils";
import type { FileStorageDrivers } from "@/core/storage/file-storage-driver";
import type { RecordFileAccessService } from "@/features/record-files/record-file-access.service";
import type { RecordDraftFileRepo } from "@/features/records/record-draft-file.repo";
import type { AttachmentMeta } from "../messaging.schema";
import type { DraftFileRepo, EmailFile, EmailFileScope } from "./draft-file.repo";

import { getLocale } from "next-intl/server";

import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { readCappedStream } from "@/core/storage/read-capped-stream";
import { fileSizeLabel } from "@/core/utils/format-bytes";

export const EMAIL_FILE_ATTACHMENTS_MAX_BYTES = 25 * 1024 * 1024;
export const EMAIL_FILE_ATTACHMENTS_MAX_COUNT = 20;

type FileAttachment = { filename: string; content_type: string; content: string };

export function draftFileIds(attachmentsMeta: readonly Pick<AttachmentMeta, "fileId">[]): string[] {
  return attachmentsMeta.flatMap((attachment) => (attachment.fileId ? [attachment.fileId] : []));
}

export class EmailFileAttachments {
  constructor(
    private repo: DraftFileRepo,
    private access: Pick<RecordFileAccessService, "readableFile">,
    private drivers: FileStorageDrivers,
    private binding: RecordDraftFileRepo,
  ) {}

  bind(args: Parameters<RecordDraftFileRepo["bindDraftFiles"]>[0]): Promise<void> {
    return this.binding.bindDraftFiles(args);
  }

  async describe(
    fileIds: readonly string[],
    scope: EmailFileScope,
  ): Validated<{ attachmentsMeta: AttachmentMeta[]; bindFileIds: string[] }> {
    const files = await this.resolve(fileIds, scope);
    if (!files.ok) return files;
    return {
      ok: true as const,
      data: {
        attachmentsMeta: files.data.map((file) => ({
          id: file.id,
          fileId: file.id,
          name: file.name,
          fileName: file.name,
          type: "file",
          mime: file.mimeType,
          size: file.size,
        })),
        bindFileIds: files.data.filter((file) => file.status === "pending").map((file) => file.id),
      },
    };
  }

  async load(fileIds: readonly string[], scope: EmailFileScope): Validated<FileAttachment[]> {
    const files = await this.resolve(fileIds, scope);
    if (!files.ok) return files;
    const attachments: FileAttachment[] = [];
    for (const file of files.data) {
      const stored = await this.drivers(file.storageDriver).read(file.storageKey);
      if (!stored) return fail(CustomErrorCode.recordFileNotFound, ["fileIds"]);
      const bytes = await readCappedStream(stored.stream, EMAIL_FILE_ATTACHMENTS_MAX_BYTES);
      if (!bytes.ok) return this.tooLarge();
      attachments.push({
        filename: file.name,
        content_type: file.mimeType,
        content: Buffer.from(bytes.bytes).toString("base64"),
      });
    }
    return { ok: true as const, data: attachments };
  }

  async file(fileId: string, scope: EmailFileScope): Validated<EmailFile> {
    const files = await this.resolve([fileId], scope);
    if (!files.ok) return files;
    const [file] = files.data;
    return file ? { ok: true as const, data: file } : fail(CustomErrorCode.recordFileNotFound, ["fileIds"]);
  }

  private async resolve(fileIds: readonly string[], scope: EmailFileScope): Validated<EmailFile[]> {
    const unique = [...new Set(fileIds)];
    if (unique.length > EMAIL_FILE_ATTACHMENTS_MAX_COUNT) return fail(CustomErrorCode.recordFileNotFound, ["fileIds"]);
    const bound = new Map(
      (scope && unique.length ? await this.repo.findDraftFiles({ fileIds: unique, scope }) : []).map((file) => [
        file.id,
        file,
      ]),
    );
    const files: EmailFile[] = [];
    let totalBytes = 0;
    for (const fileId of unique) {
      let file: EmailFile | undefined = bound.get(fileId);
      if (!file) {
        const readable = await this.access.readableFile(fileId);
        if (!readable.ok) return readable;
        file = readable.data;
      }
      totalBytes += file.size;
      if (totalBytes > EMAIL_FILE_ATTACHMENTS_MAX_BYTES) return this.tooLarge();
      files.push(file);
    }
    return { ok: true as const, data: files };
  }

  private async tooLarge() {
    return fail(CustomErrorCode.recordFileTooLarge, ["fileIds"], {
      limit: fileSizeLabel(EMAIL_FILE_ATTACHMENTS_MAX_BYTES, await getLocale()),
    });
  }
}
