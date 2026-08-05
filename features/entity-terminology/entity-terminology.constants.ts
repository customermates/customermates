import { EntityType, Resource } from "@/generated/prisma";

import type { EntityTerminologyOverride, TerminologySelectionMap } from "./entity-terminology.types";

export const CONFIGURABLE_TERMINOLOGY_ENTITY_TYPES = [
  EntityType.contact,
  EntityType.organization,
  EntityType.deal,
  EntityType.service,
] as const;

export const ENTITY_TERMINOLOGY_PRESETS: Record<EntityType, string[]> = {
  [EntityType.contact]: ["contact", "person", "client"],
  [EntityType.organization]: ["organization", "company", "account"],
  [EntityType.deal]: ["deal", "opportunity", "project"],
  [EntityType.service]: ["service", "product", "offering"],
  [EntityType.task]: ["task"],
};

export const CANONICAL_TERMINOLOGY_PRESET_KEY: Record<EntityType, string> = {
  [EntityType.contact]: "contact",
  [EntityType.organization]: "organization",
  [EntityType.deal]: "deal",
  [EntityType.service]: "service",
  [EntityType.task]: "task",
};

export const TERMINOLOGY_ENTITY_RESOURCE: Record<EntityType, Resource> = {
  [EntityType.contact]: Resource.contacts,
  [EntityType.organization]: Resource.organizations,
  [EntityType.deal]: Resource.deals,
  [EntityType.service]: Resource.services,
  [EntityType.task]: Resource.tasks,
};

export function isConfigurableTerminologyEntityType(entityType: EntityType): boolean {
  return (CONFIGURABLE_TERMINOLOGY_ENTITY_TYPES as readonly EntityType[]).includes(entityType);
}

export function terminologyPresetKeys(entityType: EntityType): string[] {
  return ENTITY_TERMINOLOGY_PRESETS[entityType];
}

export function isTerminologyPresetKey(entityType: EntityType, key: string): boolean {
  return ENTITY_TERMINOLOGY_PRESETS[entityType].includes(key);
}

export function resolveTerminologyPresetKey(entityType: EntityType, key: string | undefined): string {
  return key && isTerminologyPresetKey(entityType, key) ? key : CANONICAL_TERMINOLOGY_PRESET_KEY[entityType];
}

export function defaultTerminologySelections(): TerminologySelectionMap {
  return CONFIGURABLE_TERMINOLOGY_ENTITY_TYPES.reduce((selections, entityType) => {
    selections[entityType] = CANONICAL_TERMINOLOGY_PRESET_KEY[entityType];
    return selections;
  }, {} as TerminologySelectionMap);
}

export function terminologySelectionsFromOverrides(overrides: EntityTerminologyOverride[]): TerminologySelectionMap {
  const selections = defaultTerminologySelections();

  for (const override of overrides) {
    if (selections[override.entityType] !== undefined && override.presetKey)
      selections[override.entityType] = override.presetKey;
  }

  return selections;
}

export function terminologySelectionsToEntries(selections: TerminologySelectionMap) {
  return CONFIGURABLE_TERMINOLOGY_ENTITY_TYPES.map((entityType) => ({
    entityType,
    presetKey: selections[entityType],
  }));
}
