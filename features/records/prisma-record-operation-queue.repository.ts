import { Prisma } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import type { DueRecordOperation, RecordOperationQueueRepo } from "./record-operation-queue.repo";

export class PrismaRecordOperationQueueRepo extends TenantRepository implements RecordOperationQueueRepo {
  @BypassTenantGuard
  claimDueUnscoped(now: Date, leaseUntil: Date, take: number): Promise<DueRecordOperation[]> {
    return this.prisma.$queryRaw<DueRecordOperation[]>(Prisma.sql`
      WITH due AS (
        SELECT operation."companyId", operation.id
        FROM "RecordOperation" operation
        JOIN "RecordSchemaState" state
          ON state."companyId" = operation."companyId" AND state."activeOperationId" = operation.id
        WHERE operation.state IN ('pending', 'staging')
          AND operation.kind IN ('mutation', 'configuration', 'provider-avatar', 'restore')
          AND (operation."leaseUntil" IS NULL OR operation."leaseUntil" <= ${now})
        ORDER BY COALESCE(operation."leaseUntil", operation."createdAt"), operation."companyId", operation.id
        LIMIT ${take}
        FOR UPDATE OF operation SKIP LOCKED
      )
      UPDATE "RecordOperation" operation
      SET "leaseUntil" = ${leaseUntil}
      FROM due
      WHERE operation."companyId" = due."companyId" AND operation.id = due.id
        AND operation.state IN ('pending', 'staging')
      RETURNING operation."companyId", operation.id AS "operationId",
        operation."userId" AS "ownerUserId", operation.kind
    `);
  }
}
