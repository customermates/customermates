"use client";

import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import type { TerminologyForm } from "@/features/entity-terminology/entity-terminology.types";

import { useEntityTerminology } from "./use-entity-terminology";

const COLUMN_TERMINOLOGY: Record<string, { entityType: EntityType; form: TerminologyForm }> = {
  contacts: { entityType: EntityType.contact, form: "plural" },
  organizations: { entityType: EntityType.organization, form: "plural" },
  organization: { entityType: EntityType.organization, form: "singular" },
  deals: { entityType: EntityType.deal, form: "plural" },
  services: { entityType: EntityType.service, form: "plural" },
  tasks: { entityType: EntityType.task, form: "plural" },
};

export function useColumnLabel() {
  const t = useTranslations();
  const { term } = useEntityTerminology();

  return (columnId: string) => {
    const terminologyColumn = COLUMN_TERMINOLOGY[columnId];

    return terminologyColumn
      ? term(terminologyColumn.entityType, terminologyColumn.form)
      : t(`Common.table.columns.${columnId}`);
  };
}

export function useCanonicalColumnLabel() {
  const t = useTranslations();

  return (columnId: string) => t(`Common.table.columns.${columnId}`);
}
