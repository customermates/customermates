import { z } from "zod";

import { RecordColumnKeySchema } from "@/features/records/record-column.schema";

const SUBLIST_COLUMNS_P13N_PREFIX = "sublist-columns:";

export const SublistColumnsSchema = z
  .object({ columns: z.array(RecordColumnKeySchema).max(500) })
  .strict()
  .refine(({ columns }) => new Set(columns).size === columns.length, {
    path: ["columns"],
    message: "A column appears twice",
  });

export type SublistColumns = z.infer<typeof SublistColumnsSchema>;

export function sublistColumnsP13nId(typeId: string): string {
  return `${SUBLIST_COLUMNS_P13N_PREFIX}${typeId}`;
}

export function isSublistColumnsP13nId(p13nId: string): boolean {
  return (
    p13nId.startsWith(SUBLIST_COLUMNS_P13N_PREFIX) &&
    z.uuid().safeParse(p13nId.slice(SUBLIST_COLUMNS_P13N_PREFIX.length)).success
  );
}

export function readSublistColumns(value: unknown): SublistColumns | null {
  const parsed = SublistColumnsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
