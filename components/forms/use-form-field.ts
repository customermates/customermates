import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";

import { useAppForm } from "./form-context";

const RELATION_FIELD_ENTITY: Record<string, EntityType> = {
  contactIds: EntityType.contact,
  organizationIds: EntityType.organization,
  dealIds: EntityType.deal,
  serviceIds: EntityType.service,
  taskIds: EntityType.task,
};

export function useFormFieldErrors(id: string) {
  const store = useAppForm();
  const errors = store?.getError(id);
  const hasError = Array.isArray(errors) ? errors.length > 0 : Boolean(errors);
  return { store, errors, hasError };
}

export function useResolvedFieldLabel(id: string, label: string | null | undefined) {
  const t = useTranslations();
  const { plural } = useEntityTerminology();

  if (label === null) return undefined;
  if (label !== undefined) return label;

  const relationEntity = RELATION_FIELD_ENTITY[id];
  return relationEntity ? plural(relationEntity) : t(`Common.inputs.${id}`);
}
