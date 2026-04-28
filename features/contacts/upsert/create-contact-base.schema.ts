import { z } from "zod";

import { CustomFieldValueSchema, NotesSchema } from "@/core/base/base-entity.schema";

export const BaseCreateContactSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string(),
  emails: z.array(z.email()).optional().default([]),
  notes: NotesSchema,
  organizationIds: z.array(z.uuid()).optional().default([]),
  userIds: z.array(z.uuid()).optional().default([]),
  dealIds: z.array(z.uuid()).optional().default([]),
  taskIds: z.array(z.uuid()).optional().default([]),
  customFieldValues: z.array(CustomFieldValueSchema).optional().default([]),
});
