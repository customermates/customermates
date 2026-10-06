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
      MODEL,
      ROLES,
    );

    expect(activity.event).toBe("record_grants.updated");
    expect(activity.changes).toEqual([
      { field: "grants", label: "Contacts · Sales", previous: ["readAll"], current: ["readAll", "update"] },
      { field: "grants", label: "Contacts · Auditors", previous: ["readOwn"], current: [] },
      { field: "grants", label: "Contacts · role-new", previous: [], current: ["readAll"] },
    ]);
  });
});
