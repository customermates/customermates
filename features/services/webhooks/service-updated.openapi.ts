import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { ServiceDtoSchema } from "../service.schema";

import {
  CustomFieldValueSchema,
  DealReferenceSchema,
  TaskReferenceSchema,
  UserReferenceSchema,
} from "@/core/base/base-entity.schema";

const ServiceChangesSchema = z.object({
  name: z
    .object({
      previous: z.string(),
      current: z.string(),
    })
    .optional(),
  amount: z
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

export const WebhookServiceUpdatedSchema = z.object({
  event: z.literal("service.updated"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: z.object({
      service: ServiceDtoSchema,
      changes: ServiceChangesSchema,
    }),
  }),
  timestamp: z.date(),
});

export const webhookServiceUpdatedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookServiceUpdated",
  summary: "Service Updated",
  description: "Sent when a service is updated.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookServiceUpdatedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
