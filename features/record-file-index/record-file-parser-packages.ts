export const RECORD_FILE_PARSER_PACKAGES = {
  pdf: ["unpdf"],
  docx: ["mammoth", "html-to-text"],
  xlsx: ["exceljs"],
  html: ["html-to-text"],
} as const;

export type RecordFileParserFormat = keyof typeof RECORD_FILE_PARSER_PACKAGES;

export function recordFileParserPackages(): string[] {
  return [...new Set(Object.values(RECORD_FILE_PARSER_PACKAGES).flat())];
}
