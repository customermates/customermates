import type { AdConversionExportDto } from "../operator-lists.schema";
import type { GetAdConversionExportRepo } from "./get-ad-conversion-export.repo";
import type { Validated } from "@/core/validation/validation.utils";

import { AD_ATTRIBUTION_NOTICE_VERSION } from "@/constants/legal-documents";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failUnavailable } from "@/core/validation/interactor-failure-server";
import { env } from "@/env";
import { AdConversionExportDtoSchema } from "../operator-lists.schema";
import { googleAdsConversionCsv, isGoogleAdsCsvRow, isGoogleAdsRowWithoutCsvColumn } from "../ad-conversion-csv";
import { adConversionReferenceSecret, reportableAdConversions } from "../ad-conversion-reporting";

@OperatorInteractor
export class GetAdConversionExportInteractor {
  constructor(private readonly repo: GetAdConversionExportRepo) {}

  @ValidateOutput(AdConversionExportDtoSchema)
  async invoke(): Validated<AdConversionExportDto> {
    const secret = adConversionReferenceSecret(env.BETTER_AUTH_SECRET);
    if (!secret) return failUnavailable(CustomErrorCode.operatorUnavailable);

    const now = new Date();
    const candidates = await this.repo.listAdConversionCandidatesUnscoped(AD_ATTRIBUTION_NOTICE_VERSION);

    const rows = reportableAdConversions(candidates, secret, now).map((row) => ({
      provider: row.provider,
      identifierKind: row.identifierKind,
      identifierValue: row.identifierValue,
      conversionType: row.conversionType,
      conversionAt: row.conversionAt,
      orderId: row.orderId,
      adUserData: "Granted" as const,
      adPersonalization: "Denied" as const,
    }));

    return {
      ok: true,
      data: {
        generatedAt: now,
        rows,
        googleAdsCsv: googleAdsConversionCsv({ rows }),
        googleAdsRowCount: rows.filter(isGoogleAdsCsvRow).length,
        googleAdsWithoutColumnCount: rows.filter(isGoogleAdsRowWithoutCsvColumn).length,
      },
    };
  }
}
