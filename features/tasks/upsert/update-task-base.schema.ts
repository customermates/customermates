import { z } from "zod";

import { CustomFieldValueSchema, NotesSchema } from "@/core/base/base-entity.schema";

export const BaseUpdateTaskSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(255).optional(),
  notes: NotesSchema,
  userIds: z.array(z.uuid()).nullish(),
  contactIds: z.array(z.uuid()).nullish(),
  organizationIds: z.array(z.uuid()).nullish(),
  dealIds: z.array(z.uuid()).nullish(),
  serviceIds: z.array(z.uuid()).nullish(),
  customFieldValues: z.array(CustomFieldValueSchema).nullish(),
});
