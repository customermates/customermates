import type { RecordFileStatus } from "@/generated/prisma";
import type { RecordRef } from "./record-model.schema";

export type StoredRecordFile = {
  id: string;
  typeId: string | null;
  fieldId: string | null;
  recordId: string | null;
  conversationId: string | null;
  storageDriver: string;
  storageKey: string;
  name: string;
  mimeType: string;
  size: number;
  sha256: string | null;
  status: RecordFileStatus;
  uploadedById: string | null;
  createdAt: Date;
  attachedAt: Date | null;
  detachedAt: Date | null;
};

export abstract class RecordFileRepo {
  abstract getFilesCompanyWide(fileIds: string[]): Promise<StoredRecordFile[]>;
  abstract attachFiles(
    ref: RecordRef,
    fieldId: string,
    fileIds: string[],
    chatOwnerId?: string | null,
  ): Promise<number>;
  abstract detachFiles(ref: RecordRef, fieldId: string, fileIds: string[]): Promise<number>;
}
