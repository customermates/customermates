import { describe, expect, it } from "vitest";

import { EntityType } from "@/generated/prisma";

import {
  ACTIVITY_RELATED_RECORD_LIMIT,
  buildRecordContext,
  contextRefs,
  EMPTY_RECORD_CONTEXT,
  recordRefKey,
} from "../activity-record-refs";

const ref = (entityType: EntityType, id: string, label = id) => ({ entityType, id, label });

describe("buildRecordContext", () => {
  it("gives no context when an entry has no record association", () => {
    expect(buildRecordContext([])).toEqual(EMPTY_RECORD_CONTEXT);
  });

  it("promotes the first ref to primary", () => {
    const context = buildRecordContext([ref(EntityType.deal, "d1", "Acme renewal")]);

    expect(context.primary).toEqual(ref(EntityType.deal, "d1", "Acme renewal"));
    expect(context.related).toEqual([]);
    expect(context.relatedOverflow).toBe(0);
  });

  it("keeps the rest as related up to the bound", () => {
    const context = buildRecordContext([
      ref(EntityType.deal, "d1"),
      ref(EntityType.contact, "c1"),
      ref(EntityType.contact, "c2"),
      ref(EntityType.contact, "c3"),
    ]);

    expect(context.primary?.id).toBe("d1");
    expect(context.related.map((r) => r.id)).toEqual(["c1", "c2", "c3"]);
    expect(context.relatedOverflow).toBe(0);
  });

  it("counts everything past the bound instead of rendering an unbounded list", () => {
    const context = buildRecordContext([
      ref(EntityType.deal, "d1"),
      ref(EntityType.contact, "c1"),
      ref(EntityType.contact, "c2"),
      ref(EntityType.contact, "c3"),
      ref(EntityType.contact, "c4"),
      ref(EntityType.contact, "c5"),
    ]);

    expect(context.related).toHaveLength(ACTIVITY_RELATED_RECORD_LIMIT);
    expect(context.relatedOverflow).toBe(2);
  });

  it("deduplicates by entity type and id, so one record cannot appear twice", () => {
    const context = buildRecordContext([
      ref(EntityType.contact, "c1"),
      ref(EntityType.contact, "c1"),
      ref(EntityType.deal, "c1"),
    ]);

    expect(context.primary?.entityType).toBe(EntityType.contact);
    expect(context.related.map((r) => r.entityType)).toEqual([EntityType.deal]);
    expect(context.relatedOverflow).toBe(0);
  });

  it("treats the same id under different entity types as different records", () => {
    expect(recordRefKey(EntityType.contact, "x")).not.toBe(recordRefKey(EntityType.deal, "x"));
  });
});

describe("contextRefs", () => {
  it("flattens a context back into its refs", () => {
    const context = buildRecordContext([ref(EntityType.deal, "d1"), ref(EntityType.contact, "c1")]);

    expect(contextRefs(context).map((r) => r.id)).toEqual(["d1", "c1"]);
  });

  it("returns nothing for an empty context", () => {
    expect(contextRefs(EMPTY_RECORD_CONTEXT)).toEqual([]);
  });
});
