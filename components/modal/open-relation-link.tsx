"use client";

import { useLocale } from "next-intl";
import { ExternalLink } from "lucide-react";
import type { EntityType } from "@/generated/prisma";

import { Icon } from "@/components/shared/icon";
import { ENTITY_URL_SEGMENT } from "@/components/modal/hooks/use-entity-drawer-stack";

type RelationEntityType = "contact" | "organization" | "deal" | "service" | "task";

const FILTER_FIELD_BY_ENTITY: Record<RelationEntityType, string> = {
  contact: "contactIds",
  organization: "organizationIds",
  deal: "dealIds",
  service: "serviceIds",
  task: "taskIds",
};

type Props = {
  targetEntityType: RelationEntityType;
  currentEntityType: RelationEntityType;
  currentEntityId: string | undefined;
};

export function OpenRelationLink({ targetEntityType, currentEntityType, currentEntityId }: Props) {
  const locale = useLocale();
  if (!currentEntityId) return null;
  const segment = ENTITY_URL_SEGMENT[targetEntityType as EntityType];
  const field = FILTER_FIELD_BY_ENTITY[currentEntityType];
  const href = `/${locale}/${segment}?filters=${encodeURIComponent(`${field}:in:${currentEntityId}`)}`;
  return (
    <a className="inline-flex items-center text-muted-foreground hover:text-foreground" href={href}>
      <Icon icon={ExternalLink} size="sm" />
    </a>
  );
}
