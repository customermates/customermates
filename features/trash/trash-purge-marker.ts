import type { Prisma } from "@/generated/prisma";

export function purgeOperationIdOf(payload: Prisma.JsonValue): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const operationId = payload.purgeOperationId;
  return typeof operationId === "string" ? operationId : null;
}
