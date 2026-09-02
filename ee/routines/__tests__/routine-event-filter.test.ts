import { describe, expect, it } from "vitest";

import { EntityType } from "@/generated/prisma";

import {
  carriesChangedFields,
  changedFieldsOf,
  entityTypeForEvent,
  entityTypeForEvents,
  isRecordChangeEvent,
  isRecordRemovalEvent,
  matchesChangedFields,
} from "@/ee/routines/routine-event-filter";
import { ROUTINE_CHANGE_FIELDS } from "@/ee/routines/routine-change-fields";
import { calculateChanges } from "@/core/utils/calculate-changes";

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

  it("recognises the record events that carry a change map", () => {
    expect(isRecordChangeEvent("organization.updated")).toBe(true);
    expect(isRecordChangeEvent("organization.created")).toBe(false);
    expect(isRecordChangeEvent("messaging.chat.updated")).toBe(false);
  });

  it("recognises the record events whose record is already gone", () => {
    expect(isRecordRemovalEvent("deal.deleted")).toBe(true);
    expect(isRecordRemovalEvent("deal.updated")).toBe(false);
  });
});

describe("changed field extraction", () => {
  it("reads the changed field names from an update payload", () => {
    const eventData = {
      payload: { changes: { firstName: { previous: "A", current: "B" }, notes: { previous: 1, current: 2 } } },
    };

    expect(changedFieldsOf(eventData).sort()).toEqual(["firstName", "notes"]);
  });

  it("names a changed custom column by its column id", () => {
    const columnId = "3f1e0a12-0000-4000-8000-000000000001";
    const eventData = {
      payload: {
        changes: {
          customFieldValues: {
            previous: [{ columnId, value: "a" }],
            current: [{ columnId, value: "b" }],
          },
        },
      },
    };

    expect(changedFieldsOf(eventData)).toEqual([columnId]);
  });

  it("reports that a create payload carries no change map", () => {
    expect(carriesChangedFields({ payload: { id: "1" } })).toBe(false);
    expect(carriesChangedFields(null)).toBe(false);
    expect(changedFieldsOf({ payload: { id: "1" } })).toEqual([]);
  });

  it("reports that an update payload carries one", () => {
    expect(carriesChangedFields({ payload: { changes: {} } })).toBe(true);
  });
});

describe("the picker and the change map speak the same vocabulary", () => {
  const previous = {
    id: "3f1e0a12-0000-4000-8000-00000000000a",
    name: "Before",
    notes: "old",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    contacts: [],
    users: [],
    deals: [],
    tasks: [],
    customFieldValues: [],
  };

  it("offers every plain field an organization update can report", () => {
    const current = { ...previous, name: "After", notes: "new", users: [{ id: "u1" }] };
    const produced = Object.keys(calculateChanges(previous, current));
    const offered = new Set(ROUTINE_CHANGE_FIELDS[EntityType.organization]);

    for (const field of produced) expect(offered.has(field)).toBe(true);
  });

  it("never offers a key the change map discards", () => {
    for (const fields of Object.values(ROUTINE_CHANGE_FIELDS)) {
      expect(fields).not.toContain("updatedAt");
      expect(fields).not.toContain("createdAt");
      expect(fields).not.toContain("id");
    }
  });

  it("offers the fields a user would actually watch", () => {
    expect(ROUTINE_CHANGE_FIELDS[EntityType.organization]).toContain("name");
    expect(ROUTINE_CHANGE_FIELDS[EntityType.organization]).toContain("notes");
    expect(ROUTINE_CHANGE_FIELDS[EntityType.contact]).toContain("firstName");
    expect(ROUTINE_CHANGE_FIELDS[EntityType.deal]).toContain("totalValue");
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

  it("rejects an update that reported no changes at all", () => {
    expect(matchesChangedFields(["stage"], [])).toBe(false);
  });

  it("matches a custom column by its identifier", () => {
    expect(matchesChangedFields(["cf_renewal"], ["cf_renewal"])).toBe(true);
  });
});
