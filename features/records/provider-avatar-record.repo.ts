import type { Prisma, RecordOperation, RecordSchemaState } from "@/generated/prisma";
import type { RecordIdentity } from "./record-identity.schema";
import type { RecordModel, RecordRef } from "./record-model.schema";
import type { StoredRecord } from "./record.repo";

export type RecordOperationUpdate = {
  state?: string;
  processed?: number;
  total?: number;
  cursor?: Prisma.InputJsonValue;
  result?: Prisma.InputJsonValue;
  errorCode?: string | null;
  leaseUntil?: Date | null;
};

export abstract class ProviderAvatarRecordRepo {
  abstract getModelUnscoped(companyId: string): Promise<RecordModel>;
  abstract getStateUnscoped(companyId: string): Promise<RecordSchemaState | null>;
  abstract getIdentityChannelsUnscoped(
    companyId: string,
    keys: Array<{ channelClass: string; value: string }>,
  ): Promise<RecordIdentity[]>;
  abstract getIdentityOwnerRefsPageUnscoped(
    companyId: string,
    identityId: string,
    after: RecordRef | undefined,
    take: number,
    typeIds: string[],
  ): Promise<RecordRef[]>;
  abstract getRecordUnscoped(companyId: string, ref: RecordRef): Promise<StoredRecord | null>;
  abstract getLastFieldWritersUnscoped(
    companyId: string,
    targets: Array<{ ref: RecordRef; fieldId: string }>,
  ): Promise<Map<string, string>>;
  abstract createOperationUnscoped(
    companyId: string,
    request: { id: string; userId: string; kind: string; expectedRevision: number; request: unknown },
  ): Promise<RecordOperation>;
  abstract getOperationUnscoped(companyId: string, id: string): Promise<RecordOperation | null>;
  abstract updateOperationUnscoped(companyId: string, id: string, data: RecordOperationUpdate): Promise<void>;
  abstract clearOperationLockUnscoped(companyId: string, id: string): Promise<void>;
  abstract publishStageUnscoped(companyId: string, operationId: string, revision: number): Promise<void>;
}
