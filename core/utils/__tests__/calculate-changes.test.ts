import { describe, it, expect } from "vitest";

import { calculateChanges, hasRelationChanged, type ChangeRecord } from "../calculate-changes";

describe("calculateChanges", () => {
  it("returns empty changes when objects are identical", () => {
    const obj = { name: "Alice", age: 30 };
    expect(calculateChanges(obj, { ...obj })).toEqual({});
  });

  it("returns empty changes when previous is undefined", () => {
    expect(calculateChanges(undefined, { name: "Alice" })).toEqual({});
  });

  it("detects added fields", () => {
    const previous = { name: "Alice" } as Record<string, unknown>;
    const current = { name: "Alice", age: 30 };
    const changes = calculateChanges(previous, current);
    expect(changes).toEqual({ age: { previous: undefined, current: 30 } });
  });

  it("detects removed fields (value became undefined)", () => {
    const previous = { name: "Alice", age: 30 };
    const current = { name: "Alice" } as Record<string, unknown>;
    const changes = calculateChanges(previous, current);
    expect(changes).toEqual({ age: { previous: 30, current: undefined } });
  });

  it("detects changed string values", () => {
    const changes = calculateChanges({ name: "Alice" }, { name: "Bob" });
    expect(changes).toEqual({ name: { previous: "Alice", current: "Bob" } });
  });

  it("detects changed number values", () => {
    const changes = calculateChanges({ count: 1 }, { count: 2 });
    expect(changes).toEqual({ count: { previous: 1, current: 2 } });
  });

  it("detects changed boolean values", () => {
    const changes = calculateChanges({ active: true }, { active: false });
    expect(changes).toEqual({ active: { previous: true, current: false } });
  });

  it("detects changes in nested objects", () => {
    const previous = { profile: { email: "a@b.com" } };
    const current = { profile: { email: "c@d.com" } };
    const changes = calculateChanges(previous, current);
    expect(changes).toEqual({
      profile: { previous: { email: "a@b.com" }, current: { email: "c@d.com" } },
    });
  });

  it("does not report nested objects that are deeply equal", () => {
    const previous = { profile: { email: "a@b.com" } };
    const current = { profile: { email: "a@b.com" } };
    expect(calculateChanges(previous, current)).toEqual({});
  });

  it("detects simple array changes (no key property)", () => {
    const previous = { tags: ["a", "b"] };
    const current = { tags: ["a", "c"] };
    const changes = calculateChanges(previous, current);
    expect(changes).toEqual({
      tags: { previous: ["a", "b"], current: ["a", "c"] },
    });
  });

  it("does not report identical simple arrays", () => {
    const previous = { tags: ["a", "b"] };
    const current = { tags: ["a", "b"] };
    expect(calculateChanges(previous, current)).toEqual({});
  });

  it("detects keyed array item additions", () => {
    const previous = { items: [{ id: "1", value: "x" }] };
    const current = {
      items: [
        { id: "1", value: "x" },
        { id: "2", value: "y" },
      ],
    };
    const changes = calculateChanges(previous, current);
    expect(changes.items).toBeDefined();
    expect((changes.items.current as unknown[]).length).toBe(1);
    expect((changes.items.current as { id: string }[])[0].id).toBe("2");
  });

  it("detects keyed array item removals", () => {
    const previous = {
      items: [
        { id: "1", value: "x" },
        { id: "2", value: "y" },
      ],
    };
    const current = { items: [{ id: "1", value: "x" }] };
    const changes = calculateChanges(previous, current);
    expect(changes.items).toBeDefined();
    expect((changes.items.previous as unknown[]).length).toBe(1);
    expect((changes.items.previous as { id: string }[])[0].id).toBe("2");
  });

  it("detects keyed array item modifications", () => {
    const previous = { items: [{ id: "1", value: "x" }] };
    const current = { items: [{ id: "1", value: "y" }] };
    const changes = calculateChanges(previous, current);
    expect(changes.items).toBeDefined();
    expect(changes.items.previous).toEqual([{ id: "1", value: "x" }]);
    expect(changes.items.current).toEqual([{ id: "1", value: "y" }]);
  });

  it("uses columnId as key property for custom field arrays", () => {
    const previous = { customFieldValues: [{ columnId: "c1", value: "old" }] };
    const current = { customFieldValues: [{ columnId: "c1", value: "new" }] };
    const changes = calculateChanges(previous, current);
    expect(changes.customFieldValues).toBeDefined();
    expect(changes.customFieldValues.previous).toEqual([{ columnId: "c1", value: "old" }]);
    expect(changes.customFieldValues.current).toEqual([{ columnId: "c1", value: "new" }]);
  });

  it("handles null to value transition", () => {
    const previous = { name: null as unknown };
    const current = { name: "Alice" as unknown };
    const changes = calculateChanges(previous, current);
    expect(changes).toEqual({ name: { previous: null, current: "Alice" } });
  });

  it("handles value to null transition", () => {
    const changes = calculateChanges({ name: "Alice" as unknown }, { name: null as unknown });
    expect(changes).toEqual({ name: { previous: "Alice", current: null } });
  });
});

describe("hasRelationChanged", () => {
  it("returns false when relation field is not in changes", () => {
    expect(hasRelationChanged({}, "contacts")).toBe(false);
  });

  it("returns true when additional fields have changes", () => {
    const changes: ChangeRecord = { name: { previous: "a", current: "b" } };
    expect(hasRelationChanged(changes, "contacts", ["name"])).toBe(true);
  });

  it("returns true when array lengths differ", () => {
    const changes: ChangeRecord = {
      contacts: {
        previous: [{ id: "1" }],
        current: [{ id: "1" }, { id: "2" }],
      },
    };
    expect(hasRelationChanged(changes, "contacts")).toBe(true);
  });

  it("returns true when item IDs differ", () => {
    const changes: ChangeRecord = {
      contacts: {
        previous: [{ id: "1" }],
        current: [{ id: "2" }],
      },
    };
    expect(hasRelationChanged(changes, "contacts")).toBe(true);
  });

  it("returns true when quantities differ", () => {
    const changes: ChangeRecord = {
      services: {
        previous: [{ id: "1", quantity: 1 }],
        current: [{ id: "1", quantity: 5 }],
      },
    };
    expect(hasRelationChanged(changes, "services")).toBe(true);
  });

  it("returns false when previous/current are not arrays", () => {
    const changes: ChangeRecord = {
      name: { previous: "a", current: "b" },
    };
    expect(hasRelationChanged(changes, "name")).toBe(false);
  });
});
