import type { Prisma } from "@/generated/prisma";
import type { RecordRef } from "@/features/records/record-model.schema";

export type RecordEventWrite = {
  id: string;
  ref: RecordRef;
  actorId: string | null;
  causeId: string;
  kind: string;
  payload: Prisma.InputJsonValue;
};

export abstract class RecordEventLogRepo {
  abstract getLastFieldWritersCompanyWide(
    companyId: string,
    targets: Array<{ ref: RecordRef; fieldId: string }>,
  ): Promise<Map<string, string>>;
  abstract hasRecordHistoryCompanyWide(companyId: string, ref: RecordRef): Promise<boolean>;
  abstract appendRecordEventCompanyWide(companyId: string, event: RecordEventWrite): Promise<void>;
  abstract eraseTrashedRecordPayloadsCompanyWide(companyId: string, trashItemIds: string[]): Promise<void>;
  abstract publishStagedRecordEventsCompanyWide(companyId: string, operationId: string): Promise<void>;
}
