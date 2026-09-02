import type { Validated } from "@/core/validation/validation.utils";

import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import {
  AD_PROVIDER_ORDER,
  isAdConversionReportable,
  isAdProvider,
  type AdProvider,
} from "@/features/acquisition/ad-provider-registry";
import { AdConversionExportDtoSchema, type AdConversionExportDto } from "../operator-lists.schema";

export type AdConversionExportRow = {
  companyId: string;
  provider: AdProvider;
  identifierKind: string;
  identifierValue: string;
  clickedAt: Date;
  conversionType: string;
  conversionAt: Date;
};

export abstract class GetAdConversionExportRepo {
  abstract listAdConversionCandidatesUnscoped(): Promise<AdConversionExportRow[]>;
}

function idempotencyKey(row: AdConversionExportRow): string {
  return `${row.companyId}:${row.conversionType}:${Math.floor(row.conversionAt.getTime() / 1000)}`;
}

@OperatorInteractor
export class GetAdConversionExportInteractor {
  constructor(private readonly repo: GetAdConversionExportRepo) {}

  @ValidateOutput(AdConversionExportDtoSchema)
  async invoke(now = new Date()): Validated<AdConversionExportDto> {
    const candidates = await this.repo.listAdConversionCandidatesUnscoped();

    const rows = candidates
      .filter((row) => isAdProvider(row.provider))
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
        orderId: idempotencyKey(row),
        adUserData: "Granted" as const,
        adPersonalization: "Granted" as const,
      }));

    return { ok: true, data: { generatedAt: now, rows } };
  }
}
