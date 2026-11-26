import type { AdConversionUploadDto } from "./ad-conversion-upload.schema";
import type { AdConversionUploadMode } from "@/generated/prisma";

export type AdConversionUploadAudit = {
  trigger: "operator" | "cron";
  mode: AdConversionUploadMode;
  status: Extract<AdConversionUploadDto["status"], "authorizationFailed" | "unavailable" | "nothingToSend" | "sent">;
  eligibleCount: number;
  alreadyReportedCount: number;
  batches: Array<{ batchId: string; rowCount: number; result: AdConversionUploadDto["batches"][number]["result"] }>;
};

export const AD_CONVERSION_UPLOAD_CRON_ACTOR = "system:lifecycle-cron";

export abstract class AdConversionUploadAuditRepo {
  abstract recordAdConversionUploadUnscoped(audit: AdConversionUploadAudit): Promise<void>;
}
