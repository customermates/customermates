import type { EntityType } from "@/features/records/history/v1/legacy-enums";

export type TerminologyForm = "singular" | "plural";

export type EntityTerminologyOverride = {
  entityType: EntityType;
  presetKey: string;
};

export type TerminologyLabel = {
  singular: string;
  plural: string;
};

export type TerminologyMap = Record<EntityType, TerminologyLabel>;

export type TerminologySelectionMap = Record<string, string>;
