import { z } from "zod";

import { CustomFieldValueSchema, NotesSchema } from "@/core/base/base-entity.schema";

export const BaseUpdateContactSchema = z.object({
  id: z.uuid(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  emails: z.array(z.email()).nullable().optional(),
  notes: NotesSchema,
  organizationIds: z.array(z.uuid()).nullable().optional(),
  userIds: z.array(z.uuid()).nullable().optional(),
  dealIds: z.array(z.uuid()).nullable().optional(),
  customFieldValues: z.array(CustomFieldValueSchema).nullable().optional(),
});
