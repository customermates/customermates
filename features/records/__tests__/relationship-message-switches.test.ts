import { describe, expect, it } from "vitest";

import { ConfigurationChangeSchema } from "../configuration.schema";
import { createCrmPreset } from "../crm-preset";
import { RecordModelSchema } from "../record-model.schema";

const company = "6487f9fb-7b10-439a-b783-9d3da8184b14";

const relationship = {
  id: "$projects",
  sourceTypeId: "$lab",
  targetTypeId: "$contacts",
  sourceLabel: "Contacts",
  targetLabel: "Lab items",
  sourceCardinality: "many",
  targetCardinality: "many",
  onSourceDelete: "unlink",
  onTargetDelete: "unlink",
};

function putRelationship(fields: Record<string, unknown>) {
  return ConfigurationChangeSchema.parse({
    expectedRevision: 1,
    idempotencyKey: "relationship-switches",
    operations: [{ operation: "putRelationship", relationship: { ...relationship, ...fields } }],
  }).operations[0];
}

describe("relationship message switches at the configuration boundary", () => {
  it("defaults both switches to off when a client omits them", () => {
    expect(putRelationship({})).toMatchObject({
      operation: "putRelationship",
      relationship: { messagesOnSource: false, messagesOnTarget: false },
    });
  });

  it("keeps switches a client sets", () => {
    expect(putRelationship({ messagesOnSource: true, messagesOnTarget: false })).toMatchObject({
      relationship: { messagesOnSource: true, messagesOnTarget: false },
    });
  });

  it("rejects switches that are not booleans", () => {
    expect(() => putRelationship({ messagesOnTarget: "yes" })).toThrow();
  });

  it("keeps both switches required in the stored model", () => {
    const model = createCrmPreset(company);
    const [first, ...rest] = model.relationships;
    const withoutSwitch: Record<string, unknown> = { ...first };
    delete withoutSwitch.messagesOnSource;
    expect(RecordModelSchema.safeParse({ ...model, relationships: [withoutSwitch, ...rest] }).success).toBe(false);
  });
});
