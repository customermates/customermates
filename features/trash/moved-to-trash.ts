export type MovedToTrash = { trashBatchId: string };

export const isMovedToTrash = (value: unknown): value is MovedToTrash =>
  typeof value === "object" && value !== null && typeof (value as MovedToTrash).trashBatchId === "string";

export const movedToTrashOr = (completion: { trashBatchId?: string }): boolean | MovedToTrash =>
  completion.trashBatchId ? { trashBatchId: completion.trashBatchId } : true;
