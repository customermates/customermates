export type ExpiredRecordFile = { id: string; storageDriver: string; storageKey: string };

export type RecordFileExpiry = { pendingBefore: Date; detachedBefore: Date };

export abstract class RecordFileCleanupRepo {
  abstract findFileCompaniesUnscoped(after: string | null, limit: number): Promise<string[]>;
  abstract detachOrphanedFiles(attachedBefore: Date): Promise<number>;
  abstract findExpiredFiles(expiry: RecordFileExpiry, limit: number): Promise<ExpiredRecordFile[]>;
  abstract deleteExpiredFiles(ids: string[], expiry: RecordFileExpiry): Promise<number>;
}
