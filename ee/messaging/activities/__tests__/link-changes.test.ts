import type { RecordHistoryChanges } from "@/features/records/record-history-reader";
import type { RecordModel } from "@/features/records/record-model.schema";

import { describe, expect, it } from "vitest";

import { recordKey } from "@/features/records/record-calculation.service";

import { linkChanges } from "../link-changes";

const personTypeId = crypto.randomUUID();
const actionTypeId = crypto.randomUUID();
const relationId = crypto.randomUUID();
const managerRelationId = crypto.randomUUID();
const person = { typeId: personTypeId, recordId: crypto.randomUUID() };
const added = { typeId: actionTypeId, recordId: crypto.randomUUID() };
const removed = { typeId: actionTypeId, recordId: crypto.randomUUID() };

const model = {
  types: [
    { id: personTypeId, label: "Person" },
    { id: actionTypeId, label: "Action" },
  ],
  relationships: [
    {
      id: relationId,
      sourceTypeId: actionTypeId,
      targetTypeId: personTypeId,
      sourceLabel: "People",
      targetLabel: "Actions",
    },
    {
      id: managerRelationId,
      sourceTypeId: personTypeId,
      targetTypeId: personTypeId,
      sourceLabel: "Manager",
      targetLabel: "Reports",
    },
  ],
} as unknown as RecordModel;

const changes = (ref: typeof person) =>
  ({
    ref,
    links: [
      { relationId, source: added, target: person, before: false, after: true },
      { relationId, source: removed, target: person, before: true, after: false },
    ],
    related: [],
  }) as unknown as NonNullable<RecordHistoryChanges>;

describe("link changes", () => {
  it("names the relationship from the record's side and lists the linked records", () => {
    const titles = new Map([[recordKey(added), "Follow up"]]);
    const title = (ref: typeof person) => titles.get(recordKey(ref));
    expect(linkChanges(changes(person), model, title)).toEqual([
      {
        label: "Actions",
        before: [{ ref: removed, title: "Action" }],
        after: [{ ref: added, title: "Follow up" }],
      },
    ]);
    const outgoing = { ...changes(added), links: changes(added).links.slice(0, 1) };
    expect(linkChanges(outgoing, model, title)).toEqual([
      { label: "People", before: [], after: [{ ref: person, title: "Person" }] },
    ]);
  });

  it("names a same-list relationship from the target side and skips relationships no longer in the model", () => {
    const manager = { typeId: personTypeId, recordId: crypto.randomUUID() };
    const report = {
      ref: person,
      links: [
        { relationId: managerRelationId, source: manager, target: person, before: false, after: true },
        { relationId: crypto.randomUUID(), source: added, target: person, before: false, after: true },
      ],
      related: [],
    } as unknown as NonNullable<RecordHistoryChanges>;
    expect(linkChanges(report, model, () => "Grace")).toEqual([
      { label: "Reports", before: [], after: [{ ref: manager, title: "Grace" }] },
    ]);
  });
});
