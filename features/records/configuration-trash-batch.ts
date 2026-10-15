import { deterministicId } from "./deterministic-id";

export function configurationTrashBatchId(companyId: string, idempotencyKey: string): string {
  return deterministicId(companyId, `trash:configuration:${idempotencyKey}`);
}
