import { z } from "zod";

import { CustomFieldValueSchema, NotesSchema } from "@/core/base/base-entity.schema";

export const BaseUpdateOrganizationSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(255).optional(),
  notes: NotesSchema,
  contactIds: z.array(z.uuid()).nullish(),
  userIds: z.array(z.uuid()).nullish(),
  dealIds: z.array(z.uuid()).nullish(),
  taskIds: z.array(z.uuid()).nullish(),
  customFieldValues: z.array(CustomFieldValueSchema).nullish(),
});
