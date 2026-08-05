import type { EntityType } from "@/generated/prisma";

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
