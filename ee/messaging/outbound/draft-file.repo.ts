import type { StoredRecordFile } from "@/features/records/record-file.repo";

export type EmailFile = Pick<
  StoredRecordFile,
  "id" | "name" | "mimeType" | "size" | "status" | "fieldId" | "storageDriver" | "storageKey"
>;

export type EmailFileScope = { draftMessageId: string } | { threadId: string } | null;

export abstract class DraftFileRepo {
  abstract findDraftFiles(args: { fileIds: string[]; scope: Exclude<EmailFileScope, null> }): Promise<EmailFile[]>;
}
