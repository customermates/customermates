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
import { MessagingProviderSchema } from "@/ee/messaging/messaging.schema";

export const IdentifierInputSchema = z.object({
  provider: MessagingProviderSchema,
  value: z.string().trim().min(1).max(320),
  messagingId: z.string().trim().min(1).max(320).regex(/^\S+$/).optional(),
  displayName: z.string().max(255).optional(),
  profileUrl: z.string().max(2048).optional(),
});
export type IdentifierInput = Data<typeof IdentifierInputSchema>;

export const ContactIdentifierDtoSchema = z.object({
  id: z.uuid(),
  provider: MessagingProviderSchema,
  value: z.string(),
  messagingId: z.string().nullable(),
  displayName: z.string().nullable(),
  profileUrl: z.string().nullable(),
});
export type ContactIdentifierDto = Data<typeof ContactIdentifierDtoSchema>;

export const ContactDtoSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
  notes: NotesSchema,
  identifiers: z.array(ContactIdentifierDtoSchema),
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
