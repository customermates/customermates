import type { AdConversionUploadDto } from "./ad-conversion-upload.schema";
import type { AdConversionUploadMode } from "@/generated/prisma";

export type AdConversionUploadAudit = {
  // "operator" runs inside an operator session and is attributed to that operator; "cron" is the daily
  // lifecycle run and is attributed to AD_CONVERSION_UPLOAD_CRON_ACTOR.
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
