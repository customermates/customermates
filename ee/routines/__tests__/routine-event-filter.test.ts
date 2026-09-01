import { describe, expect, it } from "vitest";

import { EntityType } from "@/generated/prisma";

import {
  changedFieldsOf,
  entityTypeForEvent,
  entityTypeForEvents,
  matchesChangedFields,
} from "@/ee/routines/routine-event-filter";

describe("event entity types", () => {
  it("derives the entity type from an event name", () => {
    expect(entityTypeForEvent("contact.updated")).toBe(EntityType.contact);
    expect(entityTypeForEvent("deal.created")).toBe(EntityType.deal);
  });

  it("returns null for an event that names no entity", () => {
    expect(entityTypeForEvent("messaging.message.received")).toBeNull();
  });

  it("resolves one entity type when every event shares it", () => {
    expect(entityTypeForEvents(["contact.created", "contact.updated"])).toBe(EntityType.contact);
  });

  it("refuses to guess when events span entity types", () => {
    expect(entityTypeForEvents(["contact.updated", "deal.updated"])).toBeNull();
  });

  it("refuses to guess for an empty selection", () => {
    expect(entityTypeForEvents([])).toBeNull();
  });
});

describe("changed field extraction", () => {
  it("reads the changed field names from an update payload", () => {
    const payload = { changes: { firstName: { previous: "A", current: "B" }, stage: { previous: 1, current: 2 } } };

    expect(changedFieldsOf(payload).sort()).toEqual(["firstName", "stage"]);
  });

  it("returns nothing for a create payload that carries no changes", () => {
    expect(changedFieldsOf({ id: "1" })).toEqual([]);
    expect(changedFieldsOf(null)).toEqual([]);
  });
});

describe("changed field matching", () => {
  it("passes everything through when no fields are required", () => {
    expect(matchesChangedFields([], ["anything"])).toBe(true);
    expect(matchesChangedFields([], [])).toBe(true);
  });

  it("matches when any required field changed", () => {
    expect(matchesChangedFields(["stage", "amount"], ["amount"])).toBe(true);
  });

  it("rejects an update that touched only other fields", () => {
    expect(matchesChangedFields(["stage"], ["firstName", "lastName"])).toBe(false);
  });

  it("rejects a create-style event when specific fields are required", () => {
    expect(matchesChangedFields(["stage"], [])).toBe(false);
  });

  it("matches a custom column by its identifier", () => {
    expect(matchesChangedFields(["cf_renewal"], ["cf_renewal"])).toBe(true);
  });
});
