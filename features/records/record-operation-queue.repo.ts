export type DueRecordOperation = {
  companyId: string;
  operationId: string;
  ownerUserId: string;
  kind: "mutation" | "configuration" | "provider-avatar";
};

export abstract class RecordOperationQueueRepo {
  abstract claimDueUnscoped(now: Date, leaseUntil: Date, take: number): Promise<DueRecordOperation[]>;
}
