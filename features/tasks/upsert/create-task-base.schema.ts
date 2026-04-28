import { z } from "zod";

import { CustomFieldValueSchema, NotesSchema } from "@/core/base/base-entity.schema";

export const BaseCreateTaskSchema = z.object({
  name: z.string().min(1),
  notes: NotesSchema,
  userIds: z.array(z.uuid()).optional().default([]),
  contactIds: z.array(z.uuid()).optional().default([]),
  organizationIds: z.array(z.uuid()).optional().default([]),
  dealIds: z.array(z.uuid()).optional().default([]),
  serviceIds: z.array(z.uuid()).optional().default([]),
  customFieldValues: z.array(CustomFieldValueSchema).optional().default([]),
});
