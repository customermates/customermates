import { z } from "zod";
import { RecordDtoSchema } from "./record-model.schema";
import { RecordGroupingResultSchema } from "./record-grouping.schema";

export const RecordQueryResultSchema = z.object({
  records: z.array(RecordDtoSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  schemaRevision: z.number().int(),
  grouping: RecordGroupingResultSchema.optional(),
});
export type RecordQueryResult = z.infer<typeof RecordQueryResultSchema>;
