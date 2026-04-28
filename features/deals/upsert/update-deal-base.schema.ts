import { z } from "zod";

import { CustomFieldValueSchema, NotesSchema } from "@/core/base/base-entity.schema";

export const BaseUpdateDealSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).optional(),
  notes: NotesSchema,
  organizationIds: z.array(z.uuid()).nullable().optional(),
  userIds: z.array(z.uuid()).nullable().optional(),
  contactIds: z.array(z.uuid()).nullable().optional(),
  services: z
    .array(
      z.object({
        serviceId: z.uuid(),
        quantity: z.number().min(0).default(1),
      }),
    )
    .nullable()
    .optional(),
  taskIds: z.array(z.uuid()).nullable().optional(),
  customFieldValues: z.array(CustomFieldValueSchema).nullable().optional(),
});
