import type { RecordMember } from "@/features/records/record-model.schema";

export abstract class RecordMemberRepo {
  abstract getRecordMembersCompanyWide(companyId: string, userIds: string[]): Promise<RecordMember[]>;
}
