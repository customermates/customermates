import type { AdConversionExportDto, AdConversionExportRowDto } from "./operator-lists.schema";

import { ConversionEventType } from "@/generated/prisma";
import { AD_PROVIDERS } from "@/features/acquisition/ad-provider-registry";

const GOOGLE_ADS_CSV_IDENTIFIER_KIND = AD_PROVIDERS.google_ads.identifierKinds[0];

const AD_CONVERSION_ACTION_NAMES = {
  [ConversionEventType.signup]: "Customermates signup",
  [ConversionEventType.paid]: "Customermates paid",
} as const satisfies Record<ConversionEventType, string>;

export function isGoogleAdsCsvRow(row: AdConversionExportRowDto): boolean {
  return row.provider === "google_ads" && row.identifierKind === GOOGLE_ADS_CSV_IDENTIFIER_KIND;
}

export function isGoogleAdsRowWithoutCsvColumn(row: AdConversionExportRowDto): boolean {
  return row.provider === "google_ads" && row.identifierKind !== GOOGLE_ADS_CSV_IDENTIFIER_KIND;
}

function googleConversionTime(value: Date): string {
  return `${value.toISOString().slice(0, 19).replace("T", " ")}+0000`;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function csvLine(cells: readonly string[]): string {
  return cells.map(csvCell).join(",");
}

export function googleAdsConversionCsv(exported: Pick<AdConversionExportDto, "rows">): string {
  const rows = exported.rows.filter(isGoogleAdsCsvRow);
  const lines = [
    "Parameters:TimeZone=+0000",
    csvLine([
      "Google Click ID",
      "Conversion Name",
      "Conversion Time",
      "Order ID",
      "Ad User Data",
      "Ad Personalization",
    ]),
    ...rows.map((row) =>
      csvLine([
        row.identifierValue,
        AD_CONVERSION_ACTION_NAMES[row.conversionType],
        googleConversionTime(row.conversionAt),
        row.orderId,
        row.adUserData,
        row.adPersonalization,
      ]),
    ),
  ];
  return `${lines.join("\n")}\n`;
}
