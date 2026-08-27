import { z } from "zod";

import type { Data } from "@/core/validation/validation.utils";

export const AGENT_OPEN_RECORD_ENTITIES = ["contact", "organization", "deal", "service", "task"] as const;

export const OpenRecordSchema = z.object({
  entity: z.enum(AGENT_OPEN_RECORD_ENTITIES),
  recordId: z.union([z.uuid(), z.literal("new")]),
  presentation: z.enum(["page", "drawer"]).optional(),
});

export type OpenRecordData = Data<typeof OpenRecordSchema>;
