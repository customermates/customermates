import type { AppLocale } from "@/i18n/locale-registry";
import type {
  SpreadsheetColumnProfile,
  SpreadsheetPreview,
  SpreadsheetTable,
} from "@/features/data-transfer/spreadsheet/spreadsheet.schema";
import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";

import { readSpreadsheet } from "@/features/data-transfer/spreadsheet/read-spreadsheet";
import { profileSpreadsheet, spreadsheetPreview } from "@/features/data-transfer/spreadsheet/spreadsheet-profile";
import { isFormattingLocale, appLocaleOrDefault, DEFAULT_LOCALE } from "@/i18n/locale-registry";

export type SetupDataChoice = "sampleData" | "spreadsheet" | "empty";

export function setupLanguage(answers: SetupAnswers, fallback: string | null = null): AppLocale {
  const value = answers.language?.value;
  return appLocaleOrDefault(value?.format === "singleChoice" ? value.value : fallback);
}

export function setupCurrency(answers: SetupAnswers): string | null {
  const value = answers.currency?.value;
  return value?.format === "singleChoice" && /^[A-Z]{3}$/.test(value.value) ? value.value : null;
}

export function setupDataChoice(answers: SetupAnswers): SetupDataChoice {
  const value = answers.existingData?.value;
  if (value?.format !== "singleChoice") return "sampleData";
  return value.value === "spreadsheet" || value.value === "empty" ? value.value : "sampleData";
}

export function answersForPrompt(answers: SetupAnswers) {
  return Object.entries(answers).flatMap(([part, answer]) => (answer ? [{ part, value: answer.value }] : []));
}

export type LoadedSpreadsheet = {
  fileName: string;
  table: SpreadsheetTable;
  profile: SpreadsheetColumnProfile[];
  preview: SpreadsheetPreview;
};

export async function loadSetupSpreadsheet(
  file: { fileName: string; bytes: Uint8Array } | null,
  locale: string,
): Promise<LoadedSpreadsheet | null> {
  if (!file) return null;
  const read = await readSpreadsheet(file.bytes, { fileName: file.fileName });
  if (!read.ok) return null;
  const formatting = isFormattingLocale(locale) ? locale : DEFAULT_LOCALE;
  return {
    fileName: file.fileName,
    table: read.table,
    profile: profileSpreadsheet(read.table, formatting),
    preview: spreadsheetPreview(read.table),
  };
}
