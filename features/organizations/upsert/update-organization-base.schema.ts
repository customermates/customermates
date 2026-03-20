import { z } from "zod";

import { CustomFieldValueSchema, NotesSchema } from "@/core/base/base-entity.schema";

export const BaseUpdateOrganizationSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).optional(),
  notes: NotesSchema,
  contactIds: z.array(z.uuid()).nullable().optional(),
  userIds: z.array(z.uuid()).nullable().optional(),
  dealIds: z.array(z.uuid()).nullable().optional(),
  customFieldValues: z.array(CustomFieldValueSchema).nullable().optional(),
});
