import type { EntityType } from "@/generated/prisma";
import type { LucideIcon } from "lucide-react";

import { Building2, CheckCircle2, Package, TrendingUp, Users } from "lucide-react";

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

export const ENTITY_ICON: Record<EntityType, LucideIcon> = {
  contact: Users,
  organization: Building2,
  deal: TrendingUp,
  service: Package,
  task: CheckCircle2,
};
