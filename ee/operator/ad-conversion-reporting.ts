import type { AdConversionExportRow } from "./get/get-ad-conversion-export.repo";
import type { AdProvider } from "@/features/acquisition/ad-provider-registry";

import { AD_ATTRIBUTION_NOTICE_VERSION } from "@/constants/legal-documents";
import { hmacSha256Hex } from "@/core/utils/hmac";
import { AD_PROVIDER_ORDER, isAdConversionReportable, isAdProvider } from "@/features/acquisition/ad-provider-registry";

export type ReportableAdConversion = AdConversionExportRow & { provider: AdProvider; orderId: string };

export function adConversionReferenceSecret(secret: string | undefined): string | null {
  const trimmed = secret?.trim();
  return trimmed ? `ad-conversion-reference:v1:${trimmed}` : null;
}

function orderId(secret: string, row: AdConversionExportRow): string {
  const material = `${row.companyId}:${row.conversionType}:${Math.floor(row.conversionAt.getTime() / 1000)}`;
  return hmacSha256Hex(secret, material).slice(0, 32);
}

export function reportableAdConversions(
  candidates: readonly AdConversionExportRow[],
  secret: string,
  now: Date,
): ReportableAdConversion[] {
  return candidates
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
    .map((row) => ({ ...row, orderId: orderId(secret, row) }));
}
