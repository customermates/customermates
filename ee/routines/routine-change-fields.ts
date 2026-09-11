import type { ZodObject } from "zod";

import { EntityType } from "@/generated/prisma";

import { ContactDtoSchema } from "@/features/contacts/contact.schema";
import { DealDtoSchema } from "@/features/deals/deal.schema";
import { OrganizationDtoSchema } from "@/features/organizations/organization.schema";
import { ServiceDtoSchema } from "@/features/services/service.schema";
import { TaskDtoSchema } from "@/features/tasks/task.schema";

const UNWATCHABLE_FIELDS = new Set(["id", "createdAt", "updatedAt", "avatarUrl", "customFieldValues"]);

const DTO_SCHEMA_BY_ENTITY_TYPE: Record<EntityType, ZodObject> = {
  [EntityType.contact]: ContactDtoSchema,
  [EntityType.organization]: OrganizationDtoSchema,
  [EntityType.deal]: DealDtoSchema,
  [EntityType.service]: ServiceDtoSchema,
  [EntityType.task]: TaskDtoSchema,
};

function watchableFieldsOf(schema: ZodObject): string[] {
  return Object.keys(schema.shape).filter((field) => !UNWATCHABLE_FIELDS.has(field));
}

export const ROUTINE_CHANGE_FIELDS: Record<EntityType, string[]> = {
  [EntityType.contact]: watchableFieldsOf(ContactDtoSchema),
  [EntityType.organization]: watchableFieldsOf(OrganizationDtoSchema),
  [EntityType.deal]: watchableFieldsOf(DealDtoSchema),
  [EntityType.service]: watchableFieldsOf(ServiceDtoSchema),
  [EntityType.task]: watchableFieldsOf(TaskDtoSchema),
};

export function routineChangeFields(entityType: EntityType | null): string[] {
  return entityType ? ROUTINE_CHANGE_FIELDS[entityType] : [];
}

export function routineChangeFieldSchema(entityType: EntityType): ZodObject {
  return DTO_SCHEMA_BY_ENTITY_TYPE[entityType];
}
