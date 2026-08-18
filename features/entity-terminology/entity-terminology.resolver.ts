import { EntityType } from "@/generated/prisma";

import type {
  EntityTerminologyOverride,
  TerminologyForm,
  TerminologyLabel,
  TerminologyMap,
} from "./entity-terminology.types";

import { terminologyMessageKey } from "./entity-terminology.constants";

export { terminologyMessageKey };

export type TerminologyTranslate = (key: string) => string;

export function resolveEntityTerm(
  entityType: EntityType,
  form: TerminologyForm,
  override: EntityTerminologyOverride | undefined,
  translate: TerminologyTranslate,
): string {
  return translate(terminologyMessageKey(entityType, override?.presetKey ?? "", form));
}

export function resolveEntityLabel(
  entityType: EntityType,
  override: EntityTerminologyOverride | undefined,
  translate: TerminologyTranslate,
): TerminologyLabel {
  return {
    singular: resolveEntityTerm(entityType, "singular", override, translate),
    plural: resolveEntityTerm(entityType, "plural", override, translate),
  };
}

export function buildTerminologyMap(
  overrides: EntityTerminologyOverride[],
  translate: TerminologyTranslate,
): TerminologyMap {
  const byEntityType = new Map(overrides.map((override) => [override.entityType, override]));

  return Object.values(EntityType).reduce((map, entityType) => {
    map[entityType] = resolveEntityLabel(entityType, byEntityType.get(entityType), translate);
    return map;
  }, {} as TerminologyMap);
}
