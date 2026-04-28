import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { DealDtoSchema } from "../deal.schema";

import {
  CustomFieldValueSchema,
  ContactReferenceSchema,
  OrganizationReferenceSchema,
  ServiceReferenceSchema,
  TaskReferenceSchema,
  UserReferenceSchema,
} from "@/core/base/base-entity.schema";

const DealChangesSchema = z.object({
  name: z
    .object({
      previous: z.string(),
      current: z.string(),
    })
    .optional(),
  totalValue: z
    .object({
      previous: z.number(),
      current: z.number(),
    })
    .optional(),
  totalQuantity: z
    .object({
      previous: z.number(),
      current: z.number(),
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
  contacts: z
    .object({
      previous: z.array(ContactReferenceSchema),
      current: z.array(ContactReferenceSchema),
    })
    .optional(),
  services: z
    .object({
      previous: z.array(ServiceReferenceSchema),
      current: z.array(ServiceReferenceSchema),
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

export const WebhookDealUpdatedSchema = z.object({
  event: z.literal("deal.updated"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: z.object({
      deal: DealDtoSchema,
      changes: DealChangesSchema,
    }),
  }),
  timestamp: z.date(),
});

export const webhookDealUpdatedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookDealUpdated",
  summary: "Deal Updated",
  description: "Sent when a deal is updated.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookDealUpdatedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
