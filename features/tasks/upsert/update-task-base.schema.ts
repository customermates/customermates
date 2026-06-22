import { z } from "zod";

import { CustomFieldValueInputSchema, NotesSchema } from "@/core/base/base-entity.schema";
import { zx } from "@/core/validation/validation.utils";

export const BaseUpdateTaskSchema = z.object({
  id: z.uuid(),
  name: zx.nonBlankText(255).optional(),
  notes: NotesSchema,
  userIds: z.array(z.uuid()).nullish(),
  contactIds: z.array(z.uuid()).nullish(),
  organizationIds: z.array(z.uuid()).nullish(),
  dealIds: z.array(z.uuid()).nullish(),
  serviceIds: z.array(z.uuid()).nullish(),
  customFieldValues: z.array(CustomFieldValueInputSchema).nullish(),
});
