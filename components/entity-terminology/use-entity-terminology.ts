"use client";

import type { EntityType } from "@/generated/prisma";
import { useTranslations } from "next-intl";

import type { TerminologyForm, TerminologyMap } from "@/features/entity-terminology/entity-terminology.types";

import { useRootStore } from "@/core/stores/root-store.provider";
import { buildTerminologyMap, resolveEntityTerm } from "@/features/entity-terminology/entity-terminology.resolver";

export function useEntityTerminology() {
  const t = useTranslations();
  const { terminologyStore } = useRootStore();
  const overrides = terminologyStore.overrides;
  const translate = (key: string) => t(key);

  const term = (entityType: EntityType, form: TerminologyForm) =>
    resolveEntityTerm(
      entityType,
      form,
      overrides.find((override) => override.entityType === entityType),
      translate,
    );

  const singular = (entityType: EntityType) => term(entityType, "singular");
  const plural = (entityType: EntityType) => term(entityType, "plural");
  const map = (): TerminologyMap => buildTerminologyMap(overrides, translate);

  const presetLabel = (entityType: EntityType, presetKey: string, form: TerminologyForm) =>
    resolveEntityTerm(entityType, form, { entityType, presetKey }, translate);

  return { term, singular, plural, map, presetLabel };
}
