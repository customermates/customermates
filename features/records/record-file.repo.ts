import type { RecordRef } from "./record-model.schema";

export type StoredRecordFile = {
  id: string;
  typeId: string;
  fieldId: string;
  recordId: string | null;
  storageDriver: string;
  storageKey: string;
  name: string;
  mimeType: string;
  size: number;
  sha256: string | null;
  status: "pending" | "ready" | "detached";
  uploadedById: string | null;
  createdAt: Date;
  attachedAt: Date | null;
  detachedAt: Date | null;
};

export interface RecordFileRepo {
  getFilesCompanyWide(fileIds: string[]): Promise<StoredRecordFile[]>;
  attachFiles(ref: RecordRef, fieldId: string, fileIds: string[]): Promise<number>;
  detachFiles(ref: RecordRef, fieldId: string, fileIds: string[]): Promise<number>;
}
