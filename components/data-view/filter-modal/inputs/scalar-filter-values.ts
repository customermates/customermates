import { z } from "zod";
import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";
import { DecimalStringSchema, RecordDateTimeSchema } from "@/features/records/record-model.schema";

const date = z.union([z.iso.date(), RecordDateTimeSchema]);
export function validScalarFilterValue(value: string, column?: ColumnPresentation): boolean {
  if (value.includes("\0") || value.length > 100000) return false;
  switch (column?.type) {
    case "number":
    case "currency":
      return DecimalStringSchema.safeParse(value).success;
    case "date":
    case "dateRange":
      return date.safeParse(value).success;
    case "dateTime":
    case "dateTimeRange":
      return RecordDateTimeSchema.safeParse(value).success;
    default:
      return true;
  }
}
