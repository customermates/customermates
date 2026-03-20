import { z } from "zod";

import { CustomFieldValueSchema, NotesSchema } from "@/core/base/base-entity.schema";

export const BaseCreateTaskSchema = z.object({
  name: z.string().min(1),
  notes: NotesSchema,
  userIds: z.array(z.uuid()).optional().default([]),
  customFieldValues: z.array(CustomFieldValueSchema).optional().default([]),
});
