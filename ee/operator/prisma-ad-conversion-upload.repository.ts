import type {
  AdConversionUploadBatch,
  AdConversionUploadRepo,
  AdConversionUploadRow,
  AdConversionUploadSettlement,
} from "./upload-ad-conversions.repo";

import { TenantRepository } from "@/core/base/tenant-repository";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { AdConversionUploadMode, AdConversionUploadStatus } from "@/generated/prisma";

const BLOCKING_STATUSES = [
  AdConversionUploadStatus.sending,
  AdConversionUploadStatus.submitted,
  AdConversionUploadStatus.ambiguous,
];

export class PrismaAdConversionUploadRepo extends TenantRepository implements AdConversionUploadRepo {
  @BypassTenantGuard
  async listBlockingUploadsUnscoped(provider: string) {
    return this.prisma.adConversionUpload.findMany({
      where: { provider, mode: AdConversionUploadMode.ingest, status: { in: BLOCKING_STATUSES } },
      distinct: ["companyId", "conversionType"],
      select: { companyId: true, conversionType: true },
    });
  }

  @BypassTenantGuard
  async claimBatchUnscoped(batch: AdConversionUploadBatch): Promise<AdConversionUploadRow[]> {
    return runInTransaction(async () => {
      await this.prisma
        .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('customermates:ad-conversion-upload', 0))`;

      const companyIds = [...new Set(batch.rows.map((row) => row.companyId))];
      const blocking = await this.prisma.adConversionUpload.findMany({
        where: {
          companyId: { in: companyIds },
          provider: batch.provider,
          mode: AdConversionUploadMode.ingest,
          status: { in: BLOCKING_STATUSES },
        },
        distinct: ["companyId", "conversionType"],
        select: { companyId: true, conversionType: true },
      });
      const blocked = new Set(blocking.map((row) => `${row.companyId}:${row.conversionType}`));
      const claimed = batch.rows.filter((row) => !blocked.has(`${row.companyId}:${row.conversionType}`));
      if (claimed.length === 0) return [];

      await this.prisma.adConversionUpload.createMany({
        data: claimed.map((row) => ({
          companyId: row.companyId,
          batchId: batch.batchId,
          provider: batch.provider,
          destination: batch.destination,
          conversionType: row.conversionType,
          orderId: row.orderId,
          mode: batch.mode,
          status: AdConversionUploadStatus.sending,
          attemptedAt: batch.attemptedAt,
        })),
      });
      return claimed;
    });
  }

  @BypassTenantGuard
  async settleBatchUnscoped(
    batchId: string,
    companyIds: string[],
    settlement: AdConversionUploadSettlement,
  ): Promise<void> {
    await this.prisma.adConversionUpload.updateMany({
      where: { companyId: { in: companyIds }, batchId, status: AdConversionUploadStatus.sending },
      data: settlement,
    });
  }
}
