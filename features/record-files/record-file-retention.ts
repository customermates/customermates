import type { RecordFileExpiry } from "@/features/records/record-file-cleanup.repo";

import { TRASH_RETENTION_DAYS } from "@/features/trash/trash-retention";

const HOUR = 60 * 60 * 1000;

export const PENDING_RECORD_FILE_HOURS = 24;
export const DETACHED_RECORD_FILE_DAYS = TRASH_RETENTION_DAYS;

export function recordFileExpiry(now: Date): RecordFileExpiry {
  return {
    pendingBefore: new Date(now.getTime() - PENDING_RECORD_FILE_HOURS * HOUR),
    detachedBefore: new Date(now.getTime() - DETACHED_RECORD_FILE_DAYS * 24 * HOUR),
  };
}

export function orphanedRecordFileCutoff(now: Date): Date {
  return new Date(now.getTime() - PENDING_RECORD_FILE_HOURS * HOUR);
}
