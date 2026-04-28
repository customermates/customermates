import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { ContactDtoSchema } from "@/features/contacts/contact.schema";
import {
  CustomFieldValueSchema,
  DealReferenceSchema,
  OrganizationReferenceSchema,
  TaskReferenceSchema,
  UserReferenceSchema,
} from "@/core/base/base-entity.schema";

const ContactChangesSchema = z.object({
  firstName: z
    .object({
      previous: z.string(),
      current: z.string(),
    })
    .optional(),
  lastName: z
    .object({
      previous: z.string(),
      current: z.string(),
    })
    .optional(),
  createdAt: z
    .object({
      previous: z.date(),
      current: z.date(),
    })
    .optional(),
  updatedAt: z
    .object({
      previous: z.date(),
      current: z.date(),
    })
    .optional(),
  organizations: z
    .object({
      previous: z.array(OrganizationReferenceSchema),
      current: z.array(OrganizationReferenceSchema),
    })
    .optional(),
  users: z
    .object({
      previous: z.array(UserReferenceSchema),
      current: z.array(UserReferenceSchema),
    })
    .optional(),
  deals: z
    .object({
      previous: z.array(DealReferenceSchema),
      current: z.array(DealReferenceSchema),
    })
    .optional(),
  tasks: z
    .object({
      previous: z.array(TaskReferenceSchema),
      current: z.array(TaskReferenceSchema),
    })
    .optional(),
  customFieldValues: z
    .object({
      previous: z.array(CustomFieldValueSchema),
      current: z.array(CustomFieldValueSchema),
    })
    .optional(),
});

export const WebhookContactUpdatedSchema = z.object({
  event: z.literal("contact.updated"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: z.object({
      contact: ContactDtoSchema,
      changes: ContactChangesSchema,
    }),
  }),
  timestamp: z.date(),
});

export const webhookContactUpdatedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookContactUpdated",
  summary: "Contact Updated",
  description: "Sent when a contact is updated.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookContactUpdatedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
