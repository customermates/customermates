import { z } from "zod";

import { CHIP_COLORS } from "@/constants/chip-colors";
import { GroupingSchema } from "@/core/base/grouping/grouping.schema";
import { CalculatedValueSchema, RecordGroupSummaryDefinitionSchema } from "./record-model.schema";

export const RecordGroupSummaryResultSchema = RecordGroupSummaryDefinitionSchema.extend({
  label: z.string(),
  decimalPlaces: z.number().int().min(0).max(30).nullable(),
  result: CalculatedValueSchema,
});
export type RecordGroupSummaryResult = z.infer<typeof RecordGroupSummaryResultSchema>;

export const RecordGroupingResultSchema = z
  .object({
    timeZone: z.literal("UTC").optional(),
    grouping: GroupingSchema,
    kind: z.enum(["customSingleSelect", "enum", "relation", "dateBucket"]),
    supportsDragWriteBack: z.boolean(),
    columnId: z.string().optional(),
    total: z.number().int().nonnegative(),
    membershipTotal: z.number().int().nonnegative(),
    partial: z.boolean().optional(),
    groups: z.array(
      z
        .object({
          key: z.string(),
          count: z.number().int().nonnegative(),
          labelKind: z.enum(["value", "noValue", "unavailable"]),
          label: z.string().optional(),
          labelKey: z.string().optional(),
          color: z.enum(CHIP_COLORS).optional(),
          weight: z.number().finite().optional(),
          avatarUrl: z.string().nullable().optional(),
          bucketStart: z.string().optional(),
          bucketRole: z.enum(["window", "earlier", "later"]).optional(),
          isNoValue: z.boolean(),
          materialised: z.boolean(),
          itemIds: z.array(z.uuid()),
          hasMore: z.boolean(),
          writable: z.boolean().optional(),
          summaries: z.array(RecordGroupSummaryResultSchema).optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type RecordGroupingResult = z.infer<typeof RecordGroupingResultSchema>;
