import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordRevisionChange } from "@/features/records/record-revision.schema";

import { describe, expect, it } from "vitest";

import { configurationActivity } from "../configuration-activity";

const MODEL = { types: [{ id: "type-contacts", pluralLabel: "Contacts" }], fields: [] } as unknown as RecordModel;
const ROLES = new Map([
  ["role-sales", "Sales"],
  ["role-support", "Support"],
  ["role-audit", "Auditors"],
]);

function change(before: { roleId: string; actions: string[] }[], after: { roleId: string; actions: string[] }[]) {
  return {
    references: [],
    source: { kind: "role", roleId: "role-sales" },
    configuration: null,
    grants: [{ typeId: "type-contacts", before, after }],
  } as unknown as RecordRevisionChange;
}

describe("configurationActivity", () => {
  it("lists one access row per changed role and drops roles whose actions only changed order", () => {
    const activity = configurationActivity(
      change(
        [
          { roleId: "role-sales", actions: ["readAll"] },
          { roleId: "role-support", actions: ["update", "readAll"] },
          { roleId: "role-audit", actions: ["readOwn"] },
        ],
        [
          { roleId: "role-sales", actions: ["readAll", "update"] },
          { roleId: "role-support", actions: ["readAll", "update"] },
          { roleId: "role-new", actions: ["readAll"] },
        ],
      ),
      [MODEL],
      ROLES,
    );

    expect(activity.event).toBe("record_grants.updated");
    expect(activity.changes).toEqual([
      { field: "grants", label: "Contacts · Sales", previous: ["readAll"], current: ["readAll", "update"] },
      { field: "grants", label: "Contacts · Auditors", previous: ["readOwn"], current: [] },
      { field: "grants", label: "Contacts · role-new", previous: [], current: ["readAll"] },
    ]);
  });

  it("names a permanently deleted Channels field by its list from the model before the deletion", () => {
    const before = {
      types: [{ id: "type-contacts", pluralLabel: "Contacts" }],
      fields: [],
      capabilities: [{ id: "capability-channels", kind: "channels", typeId: "type-contacts", enabled: false }],
    } as unknown as RecordModel;
    const after = { ...before, capabilities: [] } as unknown as RecordModel;
    const deletion = {
      references: [],
      source: { kind: "configuration" },
      configuration: {
        operations: [{ operation: "deletePermanently", target: { kind: "channels", id: "capability-channels" } }],
      },
      grants: [],
    } as unknown as RecordRevisionChange;

    expect(configurationActivity(deletion, [after, before], ROLES).changes).toEqual([
      { field: "deletePermanently", snapshot: true, previous: undefined, current: "Contacts" },
    ]);
    expect(configurationActivity(deletion, [after], ROLES).changes.map((change) => change.current)).toEqual([
      "capability-channels",
    ]);
  });

  it("names a permanently deleted type and field from the model before the deletion", () => {
    const before = {
      types: [{ id: "type-projects", pluralLabel: "Projects" }],
      fields: [{ id: "field-budget", typeId: "type-contacts", label: "Budget" }],
    } as unknown as RecordModel;
    const deletion = {
      references: [],
      source: { kind: "configuration" },
      configuration: {
        operations: [
          { operation: "deletePermanently", target: { kind: "type", id: "type-projects" } },
          { operation: "delete", target: { kind: "field", id: "field-budget" } },
        ],
      },
      grants: [],
    } as unknown as RecordRevisionChange;

    expect(configurationActivity(deletion, [MODEL, before], ROLES).changes).toEqual([
      { field: "deletePermanently", snapshot: true, previous: undefined, current: "Projects" },
      { field: "delete", snapshot: true, previous: undefined, current: "Contacts · Budget" },
    ]);
    expect(configurationActivity(deletion, [MODEL], ROLES).changes.map((change) => change.current)).toEqual([
      "type-projects",
      "field-budget",
    ]);
  });
});
