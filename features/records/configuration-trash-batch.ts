import { deterministicId } from "./crm-preset";

export function configurationTrashBatchId(companyId: string, idempotencyKey: string): string {
  return deterministicId(companyId, `trash:configuration:${idempotencyKey}`);
}
