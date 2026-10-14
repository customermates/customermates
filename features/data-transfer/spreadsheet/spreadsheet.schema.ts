import { z } from "zod";

import { DEFAULT_LOCALE, FORMATTING_LOCALES, formattingTagFor, type FormattingLocale } from "@/i18n/locale-registry";

export const SPREADSHEET_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const SPREADSHEET_MAX_UNPACKED_BYTES = 50 * 1024 * 1024;
export const SPREADSHEET_MAX_ROWS = 2_000;
export const SPREADSHEET_MAX_COLUMNS = 100;
export const SPREADSHEET_MAX_CELL_LENGTH = 10_000;
export const SPREADSHEET_MAX_HEADER_LENGTH = 200;
export const SPREADSHEET_MAX_SHEETS = 50;
export const SPREADSHEET_SAMPLE_ROWS = 10;
export const SPREADSHEET_SAMPLE_CELL_LENGTH = 200;
export const SPREADSHEET_MAX_DISTINCT_VALUES = 20;
export const SPREADSHEET_MAX_ROW_ERRORS = 500;

export const SpreadsheetLocaleSchema = z.enum([...FORMATTING_LOCALES] as [FormattingLocale, ...FormattingLocale[]]);
export type SpreadsheetLocale = FormattingLocale;

export const SpreadsheetCellSchema = z
  .union([z.string().max(SPREADSHEET_MAX_CELL_LENGTH), z.number().finite(), z.boolean()])
  .nullable();
export type SpreadsheetCell = z.infer<typeof SpreadsheetCellSchema>;

export const SpreadsheetRowSchema = z
  .object({
    rowNumber: z.number().int().positive(),
    cells: z.array(SpreadsheetCellSchema).max(SPREADSHEET_MAX_COLUMNS),
  })
  .strict();
export type SpreadsheetRow = z.infer<typeof SpreadsheetRowSchema>;

export const SpreadsheetTableSchema = z
  .object({
    sheetName: z.string().max(SPREADSHEET_MAX_HEADER_LENGTH),
    headers: z
      .array(z.string().trim().min(1).max(SPREADSHEET_MAX_HEADER_LENGTH))
      .min(1)
      .max(SPREADSHEET_MAX_COLUMNS)
      .refine((headers) => new Set(headers).size === headers.length, "Column headers must be unique"),
    rows: z.array(SpreadsheetRowSchema).max(SPREADSHEET_MAX_ROWS),
  })
  .strict();
export type SpreadsheetTable = z.infer<typeof SpreadsheetTableSchema>;

export const SpreadsheetReadFailureCodeSchema = z.enum([
  "fileTooLarge",
  "unsupportedFormat",
  "macroWorkbook",
  "unreadableFile",
  "sheetNotFound",
  "noHeader",
  "tooManyRows",
  "tooManyColumns",
  "cellTooLong",
]);
export type SpreadsheetReadFailureCode = z.infer<typeof SpreadsheetReadFailureCodeSchema>;

export type SpreadsheetReadResult =
  | {
      ok: true;
      format: "csv" | "xlsx";
      sheetNames: string[];
      table: SpreadsheetTable;
      formulaCellsWithoutValue: number;
    }
  | { ok: false; code: SpreadsheetReadFailureCode };

export const SpreadsheetInferredTypeSchema = z.enum([
  "text",
  "number",
  "currency",
  "boolean",
  "date",
  "dateTime",
  "select",
  "email",
  "phone",
  "url",
]);
export type SpreadsheetInferredType = z.infer<typeof SpreadsheetInferredTypeSchema>;

export type SpreadsheetColumnProfile = {
  column: string;
  inferredType: SpreadsheetInferredType | null;
  filled: number;
  fillRate: number;
  distinctCount: number;
  distinctValues: Array<{ value: string; count: number }> | null;
  maxLength: number;
  dateOrder: SpreadsheetDateOrder | null;
  currencies: string[];
  multipleValues: boolean;
};

export type SpreadsheetPreview = {
  sheetName: string;
  headers: string[];
  rowCount: number;
  sample: Array<{ rowNumber: number; cells: Array<string | null> }>;
};

export const SpreadsheetDateOrderSchema = z.enum(["dmy", "mdy", "ymd"]);
export type SpreadsheetDateOrder = z.infer<typeof SpreadsheetDateOrderSchema>;

export const SpreadsheetColumnMappingSchema = z
  .object({
    column: z.string().trim().min(1).max(SPREADSHEET_MAX_HEADER_LENGTH),
    fieldId: z.uuid(),
    dateOrder: SpreadsheetDateOrderSchema.optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
  })
  .strict();
export type SpreadsheetColumnMapping = z.infer<typeof SpreadsheetColumnMappingSchema>;

export const SpreadsheetRelationshipMappingSchema = z
  .object({
    column: z.string().trim().min(1).max(SPREADSHEET_MAX_HEADER_LENGTH),
    relationId: z.uuid(),
  })
  .strict();
export type SpreadsheetRelationshipMapping = z.infer<typeof SpreadsheetRelationshipMappingSchema>;

export const SpreadsheetMappingSchema = z
  .object({
    typeId: z.uuid(),
    locale: SpreadsheetLocaleSchema,
    timeZone: z
      .string()
      .min(1)
      .max(64)
      .refine((zone) => {
        try {
          new Intl.DateTimeFormat(formattingTagFor(DEFAULT_LOCALE), { timeZone: zone });
          return true;
        } catch {
          return false;
        }
      }, "Unknown time zone")
      .default("UTC"),
    phoneCountryCode: z
      .string()
      .regex(/^[1-9]\d{0,2}$/)
      .optional(),
    columns: z.array(SpreadsheetColumnMappingSchema).max(SPREADSHEET_MAX_COLUMNS),
    relationships: z.array(SpreadsheetRelationshipMappingSchema).max(16).default([]),
  })
  .strict();
export type SpreadsheetMapping = z.infer<typeof SpreadsheetMappingSchema>;

export const SpreadsheetRowErrorCodeSchema = z.enum([
  "required",
  "invalidText",
  "invalidNumber",
  "invalidCurrency",
  "invalidBoolean",
  "invalidDate",
  "invalidDateTime",
  "invalidEmail",
  "invalidPhone",
  "invalidUrl",
  "unknownOption",
  "tooManyValues",
  "relatedNotFound",
  "relatedAmbiguous",
]);
export type SpreadsheetRowErrorCode = z.infer<typeof SpreadsheetRowErrorCodeSchema>;

export const SpreadsheetRowErrorSchema = z
  .object({
    rowNumber: z.number().int().positive(),
    column: z.string(),
    code: SpreadsheetRowErrorCodeSchema,
  })
  .strict();
export type SpreadsheetRowError = z.infer<typeof SpreadsheetRowErrorSchema>;

export type SpreadsheetMappingIssue = {
  code:
    | "typeNotImportable"
    | "unknownColumn"
    | "fieldNotImportable"
    | "duplicateField"
    | "requiredFieldUnmapped"
    | "relationshipNotImportable";
  path: Array<string | number>;
};

export const ImportSpreadsheetSchema = z
  .object({
    table: SpreadsheetTableSchema,
    mapping: SpreadsheetMappingSchema,
    idempotencyKey: z.string().min(8).max(180),
  })
  .strict();
export type ImportSpreadsheetInput = z.infer<typeof ImportSpreadsheetSchema>;

export const ImportSpreadsheetResultSchema = z
  .object({
    rowCount: z.number().int().nonnegative(),
    created: z.number().int().nonnegative(),
    linked: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
    errors: z.array(SpreadsheetRowErrorSchema).max(SPREADSHEET_MAX_ROW_ERRORS),
    schemaRevision: z.number().int().nonnegative(),
  })
  .strict();
export type ImportSpreadsheetResult = z.infer<typeof ImportSpreadsheetResultSchema>;
