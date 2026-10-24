import type { RecordRef } from "./record-model.schema";

export const RECORD_FILE_PURGED_AT = new Date(0);

export abstract class RecordFilePurgeRepo {
  abstract expireRecordFilesCompanyWide(companyId: string, refs: RecordRef[]): Promise<number>;
  abstract expireDefinitionFilesCompanyWide(
    companyId: string,
    scope: { typeIds: string[]; fieldIds: string[] },
  ): Promise<number>;
  abstract reattachListedFilesCompanyWide(companyId: string): Promise<number>;
}
