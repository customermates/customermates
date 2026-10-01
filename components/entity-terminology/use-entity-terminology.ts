"use client";

import type { EntityType } from "@/features/records/history/v1/legacy-enums";
import { useTranslations } from "next-intl";

import type { TerminologyForm, TerminologyMap } from "@/features/entity-terminology/entity-terminology.types";

import { useRootStore } from "@/core/stores/root-store.provider";
import { buildTerminologyMap, resolveEntityTerm } from "@/features/entity-terminology/entity-terminology.resolver";

export function useEntityTerminology() {
  const t = useTranslations();
  const { terminologyStore, recordWorkspaceStore } = useRootStore();
  const overrides = terminologyStore.overrides;
  const translate = (key: string) => t(key);

  const fallbackTerm = (entityType: EntityType, form: TerminologyForm) =>
    resolveEntityTerm(
      entityType,
      form,
      overrides.find((override) => override.entityType === entityType),
      translate,
    );

  const term = (entityType: EntityType, form: TerminologyForm) => {
    const type = recordWorkspaceStore?.navigation?.types.find((type) => type.legacyAlias === entityType);
    return type ? (form === "singular" ? type.label : type.pluralLabel) : fallbackTerm(entityType, form);
  };

  const singular = (entityType: EntityType) => term(entityType, "singular");
  const plural = (entityType: EntityType) => term(entityType, "plural");
  const map = (): TerminologyMap => {
    const labels = buildTerminologyMap(overrides, translate);
    for (const type of recordWorkspaceStore?.navigation?.types ?? []) {
      if (type.legacyAlias) {
        labels[type.legacyAlias] = {
          singular: type.label,
          plural: type.pluralLabel,
        };
      }
    }
    return labels;
  };

  const presetLabel = (entityType: EntityType, presetKey: string, form: TerminologyForm) =>
    resolveEntityTerm(entityType, form, { entityType, presetKey }, translate);

  return { term, singular, plural, map, presetLabel };
}
