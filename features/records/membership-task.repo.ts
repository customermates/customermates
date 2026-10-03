import type { RecordRef } from "./record-model.schema";
import type { RecordReadScope } from "./record-query.schema";

export interface MembershipTaskRepo {
  getMemberCompanyWide(userId: string): Promise<{ id: string; email: string; status: string } | null>;
  findCompanyWide(typeId: string, userId: string, take: number): Promise<RecordRef[]>;
  protect(ref: RecordRef, userId: string): Promise<void>;
  count(typeId: string, scope: RecordReadScope): Promise<number>;
}
