import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { migrateActivityQuery } from "../activity-query";
import { RecordActivityQuerySchema } from "@/ee/messaging/activities/record-activities.schema";
import { presetId } from "../../v2/contract/crm-preset";

describe("versioned activity filter migration", () => {
  it("preserves conjunctions, exclusions, both activity source kinds and stable record IDs", () => {
    const companyId = randomUUID();
    const recordId = randomUUID();
    const threadId = randomUUID();
    const accountId = randomUUID();
    const migrated = migrateActivityQuery(companyId, [
      { field: "timelineKind", operator: "in", value: ["changes", "activities"] },
      { field: "timelineKind", operator: "notIn", value: ["calendar_event"] },
      { field: "contactIds", operator: "notIn", value: [recordId] },
      { field: "organizationIds", operator: "hasSome" },
      { field: "dealIds", operator: "hasNone" },
      { field: "serviceIds", operator: "in", value: [recordId] },
      { field: "taskIds", operator: "in", value: [recordId] },
      { field: "provider", operator: "in", value: ["mail", "google"] },
      { field: "connectedAccountId", operator: "notIn", value: [accountId] },
      { field: "timelineThreadId", operator: "in", value: [threadId] },
    ]);
    expect(migrated).toEqual({
      scope: { typeIds: [], records: [] },
      kinds: ["audit", "message", "activity", "calendar_event"],
      filters: [
        { kind: "source", operator: "in", values: ["audit", "activity", "calendar_event"] },
        { kind: "source", operator: "notIn", values: ["calendar_event"] },
        { kind: "record", typeId: presetId(companyId, "contact"), operator: "notIn", recordIds: [recordId] },
        { kind: "record", typeId: presetId(companyId, "organization"), operator: "hasSome", recordIds: [] },
        { kind: "record", typeId: presetId(companyId, "deal"), operator: "hasNone", recordIds: [] },
        { kind: "record", typeId: presetId(companyId, "service"), operator: "in", recordIds: [recordId] },
        { kind: "record", typeId: presetId(companyId, "task"), operator: "in", recordIds: [recordId] },
        { kind: "provider", operator: "in", values: ["mail", "google"] },
        { kind: "account", operator: "notIn", values: [accountId] },
        { kind: "thread", operator: "in", values: [threadId] },
      ],
    });
    expect(RecordActivityQuerySchema.parse(migrated)).toEqual(migrated);
  });

  it.each([
    [{ field: "future", operator: "in", value: ["x"] }],
    [{ field: "timelineKind", operator: "in", value: ["future"] }],
    [{ field: "timelineKind", operator: "in", value: [] }],
    [{ field: "provider", operator: "notIn", value: ["mail"] }],
    [{ field: "provider", operator: "hasNone" }],
    [{ field: "contactIds", operator: "hasSome", value: [] }],
    [{ field: "contactIds", operator: "in", value: ["not-a-uuid"] }],
    [{ field: "contactIds", operator: "equals", value: randomUUID() }],
  ])("rejects unsupported semantics instead of broadening a stored filter: %j", (filter) => {
    expect(() => migrateActivityQuery(randomUUID(), [filter])).toThrow();
  });
});
