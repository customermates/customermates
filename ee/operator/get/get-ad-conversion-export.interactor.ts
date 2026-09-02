import type { AdConversionExportDto } from "../operator-lists.schema";
import type { AdIdentifierKind, AdProvider } from "@/features/acquisition/ad-provider-registry";
import type { ConversionEventType } from "@/generated/prisma";
import type { Validated } from "@/core/validation/validation.utils";

import { AD_ATTRIBUTION_NOTICE_VERSION } from "@/constants/legal-documents";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failUnavailable } from "@/core/validation/interactor-failure-server";
import { hmacSha256Hex } from "@/core/utils/hmac";
import { env } from "@/env";
import { AD_PROVIDER_ORDER, isAdConversionReportable, isAdProvider } from "@/features/acquisition/ad-provider-registry";
import { AdConversionExportDtoSchema } from "../operator-lists.schema";
import { googleAdsConversionCsv, isGoogleAdsCsvRow, isGoogleAdsRowWithoutCsvColumn } from "../ad-conversion-csv";

export type AdConversionExportRow = {
  companyId: string;
  provider: string;
  identifierKind: AdIdentifierKind;
  identifierValue: string;
  clickedAt: Date;
  consentNoticeVersion: string;
  conversionType: ConversionEventType;
  conversionAt: Date;
};

export abstract class GetAdConversionExportRepo {
  abstract listAdConversionCandidatesUnscoped(noticeVersion: string): Promise<AdConversionExportRow[]>;
}

function referenceSecret(): string | null {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  return secret ? `ad-conversion-reference:v1:${secret}` : null;
}

function idempotencyKey(secret: string, row: AdConversionExportRow): string {
  const material = `${row.companyId}:${row.conversionType}:${Math.floor(row.conversionAt.getTime() / 1000)}`;
  return hmacSha256Hex(secret, material).slice(0, 32);
}

@OperatorInteractor
export class GetAdConversionExportInteractor {
  constructor(private readonly repo: GetAdConversionExportRepo) {}

  @ValidateOutput(AdConversionExportDtoSchema)
  async invoke(): Validated<AdConversionExportDto> {
    const secret = referenceSecret();
    if (!secret) return failUnavailable(CustomErrorCode.operatorUnavailable);

    const now = new Date();
    const candidates = await this.repo.listAdConversionCandidatesUnscoped(AD_ATTRIBUTION_NOTICE_VERSION);

    const rows = candidates
      .filter((row) => row.consentNoticeVersion === AD_ATTRIBUTION_NOTICE_VERSION)
      .filter((row): row is AdConversionExportRow & { provider: AdProvider } => isAdProvider(row.provider))
      .filter((row) =>
        isAdConversionReportable({
          provider: row.provider,
          clickedAt: row.clickedAt,
          conversionAt: row.conversionAt,
          now,
        }),
      )
      .sort(
        (left, right) =>
          AD_PROVIDER_ORDER.indexOf(left.provider) - AD_PROVIDER_ORDER.indexOf(right.provider) ||
          left.conversionAt.getTime() - right.conversionAt.getTime(),
      )
      .map((row) => ({
        provider: row.provider,
        identifierKind: row.identifierKind,
        identifierValue: row.identifierValue,
        conversionType: row.conversionType,
        conversionAt: row.conversionAt,
        orderId: idempotencyKey(secret, row),
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
