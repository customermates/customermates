import type { AdConversionUploadDto } from "./ad-conversion-upload.schema";
import type { DataManagerTransport } from "./data-manager/data-manager-transport";
import type { GetAdConversionExportRepo } from "./get/get-ad-conversion-export.repo";
import type { AdConversionUploadRepo } from "./upload-ad-conversions.repo";
import type { AdConversionUploadMode } from "@/generated/prisma";
import type { Validated } from "@/core/validation/validation.utils";

import { randomUUID } from "node:crypto";

import { AD_ATTRIBUTION_NOTICE_VERSION } from "@/constants/legal-documents";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failUnavailable } from "@/core/validation/interactor-failure-server";
import { env } from "@/env";
import { adConversionReferenceSecret, reportableAdConversions } from "./ad-conversion-reporting";
import { AdConversionUploadDtoSchema } from "./ad-conversion-upload.schema";
import { resolveDataManagerUploadConfig } from "./data-manager/data-manager-config";
import {
  DATA_MANAGER_DESTINATION,
  buildDataManagerIngestRequests,
  isDataManagerUploadable,
} from "./data-manager/data-manager-request";

const PROVIDER = "google_ads";

function result(
  status: AdConversionUploadDto["status"],
  extra: Partial<Omit<AdConversionUploadDto, "status">> = {},
): AdConversionUploadDto {
  return { status, mode: null, missing: [], eligibleCount: 0, alreadyReportedCount: 0, batches: [], ...extra };
}

@OperatorInteractor
export class UploadAdConversionsInteractor {
  constructor(
    private readonly candidates: GetAdConversionExportRepo,
    private readonly ledger: AdConversionUploadRepo,
    private readonly transport: DataManagerTransport,
  ) {}

  @ValidateOutput(AdConversionUploadDtoSchema)
  async invoke(): Validated<AdConversionUploadDto> {
    const config = resolveDataManagerUploadConfig(env);
    if (config.state === "disabled") return { ok: true, data: result("disabled") };
    if (config.state === "incomplete") return { ok: true, data: result("incomplete", { missing: config.missing }) };

    const secret = adConversionReferenceSecret(env.BETTER_AUTH_SECRET);
    if (!secret) return failUnavailable(CustomErrorCode.operatorUnavailable);

    const { settings } = config;
    const mode: AdConversionUploadMode = settings.validateOnly ? "validate" : "ingest";
    const now = new Date();
    const candidates = await this.candidates.listAdConversionCandidatesUnscoped(AD_ATTRIBUTION_NOTICE_VERSION);
    const eligible = reportableAdConversions(candidates, secret, now).filter(isDataManagerUploadable);
    const blocked = new Set(
      (await this.ledger.listBlockingUploadsUnscoped(PROVIDER)).map((row) => `${row.companyId}:${row.conversionType}`),
    );
    const pending = eligible.filter((row) => !blocked.has(`${row.companyId}:${row.conversionType}`));
    const counts = { mode, eligibleCount: eligible.length, alreadyReportedCount: eligible.length - pending.length };
    if (pending.length === 0) return { ok: true, data: result("nothingToSend", counts) };

    const accessToken = await this.transport.accessToken(settings.credentials);
    if (!accessToken) return { ok: true, data: result("authorizationFailed", counts) };

    const batches: AdConversionUploadDto["batches"] = [];
    for (const request of buildDataManagerIngestRequests(pending, settings)) {
      const batchId = randomUUID();
      const companyIds = [...new Set(request.rows.map((row) => row.companyId))];
      await this.ledger.startBatchUnscoped({
        batchId,
        provider: PROVIDER,
        destination: DATA_MANAGER_DESTINATION,
        mode,
        attemptedAt: new Date(),
        rows: request.rows.map((row) => ({
          companyId: row.companyId,
          conversionType: row.conversionType,
          orderId: row.orderId,
        })),
      });

      const outcome = await this.transport.ingest(request.body, accessToken);
      await this.ledger.settleBatchUnscoped(batchId, companyIds, {
        status: outcome.result,
        httpStatus: outcome.httpStatus,
        errorStatus: outcome.result === "rejected" ? outcome.errorStatus : null,
        requestId: outcome.result === "accepted" ? outcome.requestId : null,
        settledAt: new Date(),
      });
      batches.push({ rowCount: request.rows.length, result: outcome.result });
      if (outcome.result !== "accepted") break;
    }

    return { ok: true, data: result("sent", { ...counts, batches }) };
  }
}
