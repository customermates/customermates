"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { TerminologyForm } from "@/features/entity-terminology/entity-terminology.types";

import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { isCustomField } from "@/core/utils/custom-field";

import { useEntityTerminology } from "./use-entity-terminology";

const FILTER_FIELD_TERMINOLOGY: Record<string, { entityType: EntityType; form: TerminologyForm }> = {
  contactIds: { entityType: EntityType.contact, form: "singular" },
  participantContactId: { entityType: EntityType.contact, form: "singular" },
  organizationIds: { entityType: EntityType.organization, form: "singular" },
  dealIds: { entityType: EntityType.deal, form: "singular" },
  serviceIds: { entityType: EntityType.service, form: "singular" },
  taskIds: { entityType: EntityType.task, form: "singular" },
};

export function useFilterFieldLabel() {
  const t = useTranslations();
  const { term } = useEntityTerminology();

  return (field: string, customColumns?: CustomColumnDto[]) => {
    if (isCustomField(field)) return customColumns?.find((column) => column.id === field)?.label ?? field;

    const terminologyField = FILTER_FIELD_TERMINOLOGY[field];

    return terminologyField
      ? term(terminologyField.entityType, terminologyField.form)
      : t(`Common.filters.fields.${field.replace(/\./g, "_")}`);
  };
}
