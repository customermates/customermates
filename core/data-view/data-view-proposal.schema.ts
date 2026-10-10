import { z } from "zod";

import { AiManageableDataViewSurfaceKeySchema } from "./ai-manageable-surfaces";
import { ViewKeySchema } from "./data-view-identity.schema";
import { DataViewStateSchema } from "./data-view-state.schema";

export const DataViewProposalSchema = z
  .object({
    surfaceKey: AiManageableDataViewSurfaceKeySchema,
    viewKey: ViewKeySchema.optional(),
    name: z.string().min(1).optional(),
    state: DataViewStateSchema,
  })
  .strict();

export type DataViewProposal = z.infer<typeof DataViewProposalSchema>;
