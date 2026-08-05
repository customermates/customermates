import { describe, it, expect } from "vitest";
import { EntityType } from "@/generated/prisma";

import { UpsertEntityTerminologySchema } from "../entity-terminology.schema";
import {
  defaultTerminologySelections,
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

  it("rejects a non-configurable entity type", () => {
    expect(parse([{ entityType: EntityType.task, presetKey: "task" }]).success).toBe(false);
  });

  it("requires at least one entry", () => {
    expect(parse([]).success).toBe(false);
  });
});

describe("terminology selection helpers", () => {
  it("defaults every configurable entity to its canonical preset", () => {
    const selections = defaultTerminologySelections();
    expect(selections[EntityType.contact]).toBe("contact");
    expect(selections[EntityType.service]).toBe("service");
  });

  it("round-trips overrides through selections back into entries", () => {
    const selections = terminologySelectionsFromOverrides([
      { entityType: EntityType.contact, presetKey: "client" },
      { entityType: EntityType.deal, presetKey: "opportunity" },
    ]);
    expect(selections[EntityType.contact]).toBe("client");
    expect(selections[EntityType.deal]).toBe("opportunity");

    const entries = terminologySelectionsToEntries(selections);
    expect(entries).toContainEqual({ entityType: EntityType.deal, presetKey: "opportunity" });
    expect(entries).toContainEqual({ entityType: EntityType.organization, presetKey: "organization" });
  });
});
