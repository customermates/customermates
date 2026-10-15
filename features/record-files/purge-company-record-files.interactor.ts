import type { FileStorageDrivers } from "@/core/storage/file-storage-drivers";
import type { RecordFileCleanupRepo } from "@/features/records/record-file-cleanup.repo";

import { z } from "zod";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { orphanedRecordFileCutoff, recordFileExpiry } from "./record-file-retention";

export const RECORD_FILE_PURGE_BATCH_SIZE = 100;
const RECORD_FILE_PURGE_TIMEOUT_MS = 60_000;

const PurgeCompanyRecordFilesSchema = z
  .object({ companyId: z.uuid(), now: z.iso.datetime(), detachOrphans: z.boolean() })
  .strict();
type PurgeCompanyRecordFilesData = z.infer<typeof PurgeCompanyRecordFilesSchema>;

export type CompanyRecordFilePurgeBatch = { detached: number; deleted: number; more: boolean };

@SystemInteractor
export class PurgeCompanyRecordFilesInteractor {
  constructor(
    private files: (companyId: string) => RecordFileCleanupRepo,
    private drivers: (companyId: string) => FileStorageDrivers,
  ) {}

  @Enforce(PurgeCompanyRecordFilesSchema)
  async invoke(input: PurgeCompanyRecordFilesData): Promise<CompanyRecordFilePurgeBatch> {
    const now = new Date(input.now);
    const files = this.files(input.companyId);
    const drivers = this.drivers(input.companyId);
    const expiry = recordFileExpiry(now);
    return runInTransaction(
      async () => {
        const detached = input.detachOrphans ? await files.detachOrphanedFiles(orphanedRecordFileCutoff(now)) : 0;
        const expired = await files.findExpiredFiles(expiry, RECORD_FILE_PURGE_BATCH_SIZE);
        const keys = new Map<string, string[]>();
        for (const file of expired)
          keys.set(file.storageDriver, [...(keys.get(file.storageDriver) ?? []), file.storageKey]);
        for (const [driver, storageKeys] of keys) await drivers(driver).delete(storageKeys);
        const deleted = await files.deleteExpiredFiles(
          expired.map((file) => file.id),
          expiry,
        );
        return { detached, deleted, more: expired.length === RECORD_FILE_PURGE_BATCH_SIZE };
      },
      { companyId: input.companyId, timeout: RECORD_FILE_PURGE_TIMEOUT_MS },
    );
  }
}
