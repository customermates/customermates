import { describe, expect, it } from "vitest";

import { IMPORT_ENTITIES } from "../import/import-entity.registry";

const RESOLVED_BY_RELATION_INDEX = new Set(["relationIds", "dealServices"]);

describe("import entity registry", () => {
  it("declares a relation target on every field the plan resolves through the relation index", () => {
    const missing = Object.values(IMPORT_ENTITIES).flatMap((descriptor) =>
      descriptor.fields
        .filter((field) => RESOLVED_BY_RELATION_INDEX.has(field.kind) && !field.relationTarget)
        .map((field) => `${descriptor.entityType}.${field.key}`),
    );

    expect(missing).toEqual([]);
  });

  it("keeps deal services resolvable, which is what a deals round trip depends on", () => {
    const services = IMPORT_ENTITIES.deal.fields.find((field) => field.key === "services");

    expect(services?.kind).toBe("dealServices");
    expect(services?.relationTarget).toBe("service");
  });
});
