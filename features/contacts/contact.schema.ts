import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import {
  CustomFieldValueSchema,
  DealReferenceSchema,
  OrganizationReferenceSchema,
  UserReferenceSchema,
  TaskReferenceSchema,
  NotesSchema,
} from "@/core/base/base-entity.schema";
import { CustomColumnDtoSchema } from "@/features/custom-column/custom-column.schema";

export const ContactDtoSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  emails: z.array(z.email()),
  notes: NotesSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  organizations: z.array(OrganizationReferenceSchema),
  users: z.array(UserReferenceSchema),
  deals: z.array(DealReferenceSchema),
  tasks: z.array(TaskReferenceSchema),
  customFieldValues: z
    .array(CustomFieldValueSchema)
    .describe(
      "Custom field values for this contact. Query available custom field configurations via GET /v1/contacts/configuration, which returns customColumns with their definitions.",
    ),
});

export type ContactDto = Data<typeof ContactDtoSchema>;

export const ContactByIdResponseSchema = z.object({
  contact: ContactDtoSchema.nullable(),
  customColumns: z.array(CustomColumnDtoSchema),
});
