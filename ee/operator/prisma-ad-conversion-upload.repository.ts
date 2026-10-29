import type {
  AdConversionUploadBatch,
  AdConversionUploadRepo,
  AdConversionUploadSettlement,
} from "./upload-ad-conversions.repo";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { AdConversionUploadMode, AdConversionUploadStatus } from "@/generated/prisma";

const BLOCKING_STATUSES = [
  AdConversionUploadStatus.sending,
  AdConversionUploadStatus.accepted,
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
  async startBatchUnscoped(batch: AdConversionUploadBatch): Promise<void> {
    await this.prisma.adConversionUpload.createMany({
      data: batch.rows.map((row) => ({
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
