import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import {
  CustomFieldValueSchema,
  ContactReferenceSchema,
  DealReferenceSchema,
  UserReferenceSchema,
  NotesSchema,
} from "@/core/base/base-entity.schema";
import { CustomColumnDtoSchema } from "@/features/custom-column/custom-column.schema";

export const OrganizationDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  notes: NotesSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  contacts: z.array(ContactReferenceSchema),
  users: z.array(UserReferenceSchema),
  deals: z.array(DealReferenceSchema),
  customFieldValues: z
    .array(CustomFieldValueSchema)
    .describe(
      "Custom field values for this organization. Query available custom field configurations via GET /v1/organizations/configuration, which returns customColumns with their definitions.",
    ),
});

export type OrganizationDto = Data<typeof OrganizationDtoSchema>;

export const OrganizationByIdResponseSchema = z.object({
  organization: OrganizationDtoSchema.nullable(),
  customColumns: z.array(CustomColumnDtoSchema),
});
