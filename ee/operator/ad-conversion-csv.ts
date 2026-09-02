import type { AdConversionExportDto } from "./operator-lists.schema";

export const AD_CONVERSION_ACTION_NAMES = {
  signup: "Customermates signup",
  paid: "Customermates paid",
} as const;

function googleConversionTime(value: Date): string {
  return `${value.toISOString().slice(0, 19).replace("T", " ")}+0000`;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function csvLine(cells: readonly string[]): string {
  return cells.map(csvCell).join(",");
}

function conversionActionName(conversionType: string): string {
  return conversionType === "paid" ? AD_CONVERSION_ACTION_NAMES.paid : AD_CONVERSION_ACTION_NAMES.signup;
}

export function googleAdsConversionCsv(exported: AdConversionExportDto): string {
  const rows = exported.rows.filter((row) => row.provider === "google_ads");
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
        conversionActionName(row.conversionType),
        googleConversionTime(row.conversionAt),
        row.orderId,
        row.adUserData,
        row.adPersonalization,
      ]),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

export function adConversionLedgerCsv(exported: AdConversionExportDto): string {
  const rows = exported.rows.filter((row) => row.provider !== "google_ads");
  const lines = [
    csvLine([
      "Provider",
      "Identifier Kind",
      "Identifier Value",
      "Conversion Name",
      "Conversion Time",
      "Order ID",
      "Ad User Data",
      "Ad Personalization",
    ]),
    ...rows.map((row) =>
      csvLine([
        row.provider,
        row.identifierKind,
        row.identifierValue,
        conversionActionName(row.conversionType),
        row.conversionAt.toISOString(),
        row.orderId,
        row.adUserData,
        row.adPersonalization,
      ]),
    ),
  ];
  return `${lines.join("\n")}\n`;
}
