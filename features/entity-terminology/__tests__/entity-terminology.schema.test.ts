import { describe, it, expect } from "vitest";
import { EntityType } from "@/generated/prisma";

import { UpsertEntityTerminologySchema } from "../entity-terminology.schema";
import {
  CONFIGURABLE_TERMINOLOGY_ENTITY_TYPES,
  defaultTerminologySelections,
  ENTITY_TERMINOLOGY_PRESETS,
  terminologySelectionsFromOverrides,
  terminologySelectionsToEntries,
} from "../entity-terminology.constants";

function parse(entries: unknown[]) {
  return UpsertEntityTerminologySchema.safeParse({ entries });
}

describe("UpsertEntityTerminologySchema", () => {
  it("accepts a valid preset entry", () => {
    expect(parse([{ entityType: EntityType.contact, presetKey: "client" }]).success).toBe(true);
  });

  it("rejects an unknown preset", () => {
    expect(parse([{ entityType: EntityType.contact, presetKey: "not-a-preset" }]).success).toBe(false);
  });

  it("rejects a missing preset", () => {
    expect(parse([{ entityType: EntityType.contact }]).success).toBe(false);
  });

  it.each(ENTITY_TERMINOLOGY_PRESETS[EntityType.task])("accepts the Task preset %s", (presetKey) => {
    expect(parse([{ entityType: EntityType.task, presetKey }]).success).toBe(true);
  });

  it.each(["product", "not-a-preset"])("rejects the cross-entity or unknown Task preset %s", (presetKey) => {
    expect(parse([{ entityType: EntityType.task, presetKey }]).success).toBe(false);
  });

  it("requires at least one entry", () => {
    expect(parse([]).success).toBe(false);
  });
});

describe("terminology selection helpers", () => {
  it("defaults every configurable entity to its canonical preset", () => {
    expect(CONFIGURABLE_TERMINOLOGY_ENTITY_TYPES).toEqual([
      EntityType.contact,
      EntityType.organization,
      EntityType.deal,
      EntityType.service,
      EntityType.task,
    ]);
    expect(defaultTerminologySelections()).toEqual({
      contact: "contact",
      organization: "organization",
      deal: "deal",
      service: "service",
      task: "task",
    });
  });

  it("hydrates legacy four-entry overrides with a canonical Task and serializes five ordered entries", () => {
    const selections = terminologySelectionsFromOverrides([
      { entityType: EntityType.contact, presetKey: "client" },
      { entityType: EntityType.organization, presetKey: "company" },
      { entityType: EntityType.deal, presetKey: "opportunity" },
      { entityType: EntityType.service, presetKey: "product" },
    ]);
    expect(selections).toEqual({
      contact: "client",
      organization: "company",
      deal: "opportunity",
      service: "product",
      task: "task",
    });

    selections[EntityType.task] = "followUp";
    expect(terminologySelectionsToEntries(selections)).toEqual([
      { entityType: EntityType.contact, presetKey: "client" },
      { entityType: EntityType.organization, presetKey: "company" },
      { entityType: EntityType.deal, presetKey: "opportunity" },
      { entityType: EntityType.service, presetKey: "product" },
      { entityType: EntityType.task, presetKey: "followUp" },
    ]);
  });

  it("falls back from stale stored keys instead of poisoning the settings form", () => {
    expect(terminologySelectionsFromOverrides([{ entityType: EntityType.task, presetKey: "retired" }])).toEqual({
      contact: "contact",
      organization: "organization",
      deal: "deal",
      service: "service",
      task: "task",
    });
  });
});
