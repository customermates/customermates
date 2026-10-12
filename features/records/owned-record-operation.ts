import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { RecordOperationInput } from "./record-operation.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

type RecordOperation = NonNullable<Awaited<ReturnType<RecordRepo["getOperation"]>>>;

export abstract class OwnedRecordOperationInteractor<TOutput> extends AuthenticatedInteractor<
  RecordOperationInput,
  TOutput
> {
  constructor(
    protected records: RecordRepo,
    protected policy: RecordAccessPolicy,
  ) {
    super();
  }

  protected async ownedOperation(
    operationId: string,
    adminMayAccess: (operation: RecordOperation) => boolean,
  ): Promise<RecordOperation | null> {
    const [operation, policy] = await Promise.all([this.records.getOperation(operationId), this.policy.load()]);
    if (!operation || !policy.actor) return null;
    return operation.userId === this.userId || (policy.isAdmin && adminMayAccess(operation)) ? operation : null;
  }
}
