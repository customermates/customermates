import { z } from "zod";

import { CustomFieldValueInputSchema, NotesSchema } from "@/core/base/base-entity.schema";
import { zx } from "@/core/validation/validation.utils";

export const BaseCreateTaskSchema = z.object({
  name: zx.nonBlankText(255),
  notes: NotesSchema,
  userIds: z.array(z.uuid()).optional().default([]),
  contactIds: z.array(z.uuid()).optional().default([]),
  organizationIds: z.array(z.uuid()).optional().default([]),
  dealIds: z.array(z.uuid()).optional().default([]),
  serviceIds: z.array(z.uuid()).optional().default([]),
  customFieldValues: z.array(CustomFieldValueInputSchema).optional().default([]),
});
