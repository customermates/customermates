import type { Prisma } from "@/generated/prisma";

import { failureUnwindCause } from "@/core/validation/failure-unwind";

export const TRASH_PURGE_BLOCKED_BY_TRASH = "trash";

export function purgeBlockOf(error: unknown): { reasons: string; waitsForTrash: boolean } | null {
  const values = failureUnwindCause(error)?.values;
  if (typeof values?.reasons !== "string" || typeof values.blockedBy !== "string") return null;
  return { reasons: values.reasons, waitsForTrash: values.blockedBy === TRASH_PURGE_BLOCKED_BY_TRASH };
}

export function purgeOperationIdOf(payload: Prisma.JsonValue): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const operationId = payload.purgeOperationId;
  return typeof operationId === "string" ? operationId : null;
}
