import { useTranslations } from "next-intl";
import { EntityType } from "@/features/records/history/v1/legacy-enums";

import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";

import { useAppForm } from "./form-context";

const RELATION_FIELD_ENTITY: Record<string, EntityType> = {
  contactIds: EntityType.contact,
  organizationIds: EntityType.organization,
  dealIds: EntityType.deal,
  serviceIds: EntityType.service,
  taskIds: EntityType.task,
};

function hasErrors(errors: string | string[] | undefined) {
  return Array.isArray(errors) ? errors.length > 0 : Boolean(errors);
}

export function useFormFieldErrors(id: string) {
  const store = useAppForm();
  const errors = store?.getError(id);
  const hasError = hasErrors(errors);
  return { store, errors, hasError };
}

export function useFormFieldItemErrors(id: string, itemCount: number) {
  const { store, hasError: hasFieldError } = useFormFieldErrors(id);
  const itemErrors = Array.from({ length: itemCount }, (_, index) => hasErrors(store?.getError(`${id}[${index}]`)));
  return { itemErrors, hasError: hasFieldError || itemErrors.some(Boolean) };
}

export function useResolvedFieldLabel(id: string, label: string | null | undefined) {
  const t = useTranslations();
  const { plural } = useEntityTerminology();

  if (label === null) return undefined;
  if (label !== undefined) return label;

  const relationEntity = RELATION_FIELD_ENTITY[id];
  return relationEntity ? plural(relationEntity) : t(`Common.inputs.${id}`);
}
