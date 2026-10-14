import type { RecordAccessMap } from "../record-query.schema";

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createCrmPreset, presetId } from "../crm-preset";
import { fieldReadPredicate } from "../record-query";

const companyId = randomUUID();
const userId = randomUUID();
const id = (key: string) => presetId(companyId, key);

function trashedModel() {
  const model = createCrmPreset(companyId);
  return {
    ...model,
    types: model.types.map((type) => (type.id === id("contact") ? { ...type, archived: true } : type)),
  };
}

function access(model: ReturnType<typeof trashedModel>, deal: "all" | "own" = "all"): RecordAccessMap {
  return new Map(
    model.types.map((type) => [
      type.id,
      { userId, access: type.archived ? ("none" as const) : type.id === id("deal") ? deal : ("all" as const) },
    ]),
  );
}

describe("fieldReadPredicate", () => {
  it("skips the dependency subqueries for a reader of every live list while a list is in Trash", () => {
    const model = trashedModel();
    const field = model.fields.find((candidate) => candidate.typeId === id("deal"));
    if (!field) throw new Error("The preset has no deal field");
    expect(fieldReadPredicate(companyId, field, model, access(model)).sql).toBe("TRUE");
  });

  it("keeps the dependency check when a live list is only partly readable", () => {
    const model = trashedModel();
    const formula = model.fields.find((candidate) => candidate.behavior.kind !== "input");
    if (!formula) throw new Error("The preset has no calculated field");
    expect(fieldReadPredicate(companyId, formula, model, access(model, "own")).sql).not.toBe("TRUE");
  });
});
