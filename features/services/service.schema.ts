import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import {
  CustomFieldValueSchema,
  DealReferenceSchema,
  UserReferenceSchema,
  NotesSchema,
} from "@/core/base/base-entity.schema";
import { CustomColumnDtoSchema } from "@/features/custom-column/custom-column.schema";

export const ServiceDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  amount: z.number(),
  notes: NotesSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  users: z.array(UserReferenceSchema),
  deals: z.array(DealReferenceSchema),
  customFieldValues: z
    .array(CustomFieldValueSchema)
    .describe(
      "Custom field values for this service. Query available custom field configurations via GET /v1/services/configuration, which returns customColumns with their definitions.",
    ),
});

export type ServiceDto = Data<typeof ServiceDtoSchema>;

export const ServiceByIdResponseSchema = z.object({
  service: ServiceDtoSchema.nullable(),
  customColumns: z.array(CustomColumnDtoSchema),
});
