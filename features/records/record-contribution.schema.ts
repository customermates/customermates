import { z } from "zod";

import { CalculatedValueSchema, RecordRefSchema } from "./record-model.schema";
import { RecordMeasureSchema } from "./record-measure.schema";

const RecordContributionGroupSchema = z
  .object({
    record: RecordRefSchema.nullable(),
    label: CalculatedValueSchema.refine(
      (label) => label.state !== "restricted",
      "A restricted group cannot be inspected",
    ),
  })
  .strict();

export const RecordContributionSchema = z
  .object({
    measure: RecordMeasureSchema,
    group: RecordContributionGroupSchema.nullable(),
    title: z.string().min(1).max(255),
    groupLabel: z.string().max(500).nullable(),
  })
  .strict();

export type RecordContribution = z.infer<typeof RecordContributionSchema>;
export type RecordContributionGroup = z.infer<typeof RecordContributionGroupSchema>;
