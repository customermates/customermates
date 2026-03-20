import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import {
  CustomFieldValueSchema,
  ContactReferenceSchema,
  OrganizationReferenceSchema,
  UserReferenceSchema,
  ServiceReferenceSchema,
  NotesSchema,
} from "@/core/base/base-entity.schema";

export const ServiceWithQuantityReferenceSchema = z.object({
  serviceId: z.uuid(),
  quantity: z.number(),
});

export const DealDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  totalValue: z.number(),
  totalQuantity: z.number(),
  notes: NotesSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  organizations: z.array(OrganizationReferenceSchema),
  users: z.array(UserReferenceSchema),
  contacts: z.array(ContactReferenceSchema),
  services: z.array(ServiceReferenceSchema),
  servicesWithQuantity: z.array(ServiceWithQuantityReferenceSchema),
  customFieldValues: z
    .array(CustomFieldValueSchema)
    .describe(
      "Custom field values for this deal. Query available custom field configurations via GET /v1/deals/configuration, which returns customColumns with their definitions.",
    ),
});

export type DealDto = Data<typeof DealDtoSchema>;
