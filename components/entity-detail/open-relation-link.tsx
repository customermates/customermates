"use client";

import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import type { EntityType } from "@/generated/prisma";

import { IconButton } from "@/components/ui/icon-button";
import type { RelationEntityType } from "@/components/entity-detail/entity-relations";

import { ENTITY_URL_SEGMENT, RELATION_FILTER_FIELD } from "@/components/entity-detail/entity-relations";

type Props = {
  targetEntityType: RelationEntityType;
  currentEntityType: RelationEntityType;
  currentEntityId: string | undefined;
};

export function OpenRelationLink({ targetEntityType, currentEntityType, currentEntityId }: Props) {
  const t = useTranslations();
  if (!currentEntityId) return null;
  const segment = ENTITY_URL_SEGMENT[targetEntityType as EntityType];
  const field = RELATION_FILTER_FIELD[currentEntityType];
  const href = `/${segment}?filters=${encodeURIComponent(`${field}:in:${currentEntityId}`)}`;
  return <IconButton href={href} icon={ExternalLink} label={t("Common.actions.openList")} />;
}
