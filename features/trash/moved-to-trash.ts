export type MovedToTrash = { trashBatchId: string } | { trashOperationId: string; count: number };

export const isMovedToTrash = (value: unknown): value is MovedToTrash =>
  typeof value === "object" &&
  value !== null &&
  (typeof (value as { trashBatchId?: unknown }).trashBatchId === "string" ||
    typeof (value as { trashOperationId?: unknown }).trashOperationId === "string");

export const movedToTrashOr = (completion: { trashBatchId?: string }): boolean | MovedToTrash =>
  completion.trashBatchId ? { trashBatchId: completion.trashBatchId } : true;

export const movingToTrash = (operationId: string, count: number): MovedToTrash => ({
  trashOperationId: operationId,
  count,
});
