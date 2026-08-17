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

function humanizeColumnId(columnId: string): string {
  const words = columnId
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/);

  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function useCanonicalColumnLabel() {
  const t = useTranslations();

  return (columnId: string) =>
    t.has(`Common.table.columns.${columnId}`) ? t(`Common.table.columns.${columnId}`) : humanizeColumnId(columnId);
}
