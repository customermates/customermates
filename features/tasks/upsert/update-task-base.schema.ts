import { z } from "zod";

import { CustomFieldValueSchema, NotesSchema } from "@/core/base/base-entity.schema";

export const BaseUpdateTaskSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).optional(),
  notes: NotesSchema,
  userIds: z.array(z.uuid()).nullable().optional(),
  customFieldValues: z.array(CustomFieldValueSchema).nullable().optional(),
});
