import type { AdConversionUploadMode, AdConversionUploadStatus, ConversionEventType } from "@/generated/prisma";

export type AdConversionUploadRow = { companyId: string; conversionType: ConversionEventType; orderId: string };

export type AdConversionUploadBatch = {
  batchId: string;
  provider: string;
  destination: string;
  mode: AdConversionUploadMode;
  attemptedAt: Date;
  rows: AdConversionUploadRow[];
};

export type AdConversionUploadSettlement = {
  status: Exclude<AdConversionUploadStatus, "sending">;
  httpStatus: number | null;
  errorStatus: string | null;
  requestId: string | null;
  settledAt: Date;
};

export abstract class AdConversionUploadRepo {
  abstract listBlockingUploadsUnscoped(
    provider: string,
  ): Promise<Array<{ companyId: string; conversionType: ConversionEventType }>>;
  abstract claimBatchUnscoped(batch: AdConversionUploadBatch): Promise<AdConversionUploadRow[]>;
  abstract settleBatchUnscoped(
    batchId: string,
    companyIds: string[],
    settlement: AdConversionUploadSettlement,
  ): Promise<void>;
}
