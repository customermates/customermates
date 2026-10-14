import { describe, expect, it } from "vitest";

import type { RecordModel } from "../record-model.schema";

import { nestedSublistIssues } from "../record-sublist-nesting";

type Type = RecordModel["types"][number];
type Relationship = RecordModel["relationships"][number];

const type = (id: string, embedded: boolean, parentRelationshipId: string | null = null) =>
  ({ id, embedded, parentRelationshipId, archived: false }) as Type;
const parent = (id: string, sourceTypeId: string, targetTypeId: string) =>
  ({ id, sourceTypeId, targetTypeId, archived: false }) as Relationship;
const model = (types: Type[], relationships: Relationship[]) => ({ types, relationships }) as RecordModel;

const before = model(
  [type("deal", false), type("line", true, "line.deal"), type("part", true)],
  [parent("line.deal", "line", "deal"), parent("part.line", "part", "line")],
);

describe("sub-list nesting", () => {
  it("flags a sub-list placed under another sub-list", () => {
    const after = model(
      [type("deal", false), type("line", true, "line.deal"), type("part", true, "part.line")],
      before.relationships,
    );
    expect(nestedSublistIssues(after, before)).toEqual([{ code: "nested_sublist", typeId: "part" }]);
  });

  it("allows a sub-list of a top-level list", () => {
    const after = model(
      [...before.types.filter((item) => item.id !== "part"), type("part", true, "part.deal")],
      [...before.relationships, parent("part.deal", "part", "deal")],
    );
    expect(nestedSublistIssues(after, before)).toEqual([]);
  });

  it("does not block other changes to a workspace that already nests sub-lists", () => {
    const nested = model(
      [type("deal", false), type("line", true, "line.deal"), type("part", true, "part.line")],
      before.relationships,
    );
    expect(nestedSublistIssues(nested, nested)).toEqual([]);
  });
});
