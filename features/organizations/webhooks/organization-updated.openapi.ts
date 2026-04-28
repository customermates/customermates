import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { OrganizationDtoSchema } from "../organization.schema";

import {
  CustomFieldValueSchema,
  ContactReferenceSchema,
  DealReferenceSchema,
  TaskReferenceSchema,
  UserReferenceSchema,
} from "@/core/base/base-entity.schema";

const OrganizationChangesSchema = z.object({
  name: z
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
  contacts: z
    .object({
      previous: z.array(ContactReferenceSchema),
      current: z.array(ContactReferenceSchema),
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

export const WebhookOrganizationUpdatedSchema = z.object({
  event: z.literal("organization.updated"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: z.object({
      organization: OrganizationDtoSchema,
      changes: OrganizationChangesSchema,
    }),
  }),
  timestamp: z.date(),
});

export const webhookOrganizationUpdatedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookOrganizationUpdated",
  summary: "Organization Updated",
  description: "Sent when an organization is updated.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookOrganizationUpdatedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
