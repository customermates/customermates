import type { EntityType } from "@/generated/prisma";

export const RELATION_ENTITY_TYPES = ["contact", "organization", "deal", "service", "task"] as const;

export type RelationEntityType = (typeof RELATION_ENTITY_TYPES)[number];

export const RELATION_FILTER_FIELD: Record<RelationEntityType, string> = {
  contact: "contactIds",
  organization: "organizationIds",
  deal: "dealIds",
  service: "serviceIds",
  task: "taskIds",
};

export const ENTITY_URL_SEGMENT: Record<EntityType, string> = {
  contact: "contacts",
  organization: "organizations",
  deal: "deals",
  service: "services",
  task: "tasks",
};
