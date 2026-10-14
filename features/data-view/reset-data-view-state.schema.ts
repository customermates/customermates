import { z } from "zod";
import { DATA_VIEW_STATE_FIELDS, ViewKeySchema } from "@/core/data-view/data-view-state.schema";
import { RecordSurfaceKeySchema } from "@/core/data-view/data-view-identity.schema";

export const ResetDataViewStateSchema = z
  .object({
    surfaceKey: RecordSurfaceKeySchema,
    viewKey: ViewKeySchema,
    fields: z.array(z.enum(DATA_VIEW_STATE_FIELDS)).min(1).max(DATA_VIEW_STATE_FIELDS.length),
  })
  .strict();
export type ResetDataViewStateInput = z.infer<typeof ResetDataViewStateSchema>;
export const ResetDataViewStateResultSchema = z.object({ viewKey: ViewKeySchema }).strict();
