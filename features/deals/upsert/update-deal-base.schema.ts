import { z } from "zod";

import { CustomFieldValueSchema, NotesSchema } from "@/core/base/base-entity.schema";

export const BaseUpdateDealSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(255).optional(),
  notes: NotesSchema,
  organizationIds: z.array(z.uuid()).nullish(),
  userIds: z.array(z.uuid()).nullish(),
  contactIds: z.array(z.uuid()).nullish(),
  services: z
    .array(
      z.object({
        serviceId: z.uuid(),
        quantity: z.number().min(0).default(1),
      }),
    )
    .nullable()
    .optional(),
  taskIds: z.array(z.uuid()).nullish(),
  customFieldValues: z.array(CustomFieldValueSchema).nullish(),
});
