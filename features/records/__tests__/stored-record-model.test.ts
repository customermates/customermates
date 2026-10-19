import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createCrmPreset, presetId } from "../crm-preset";
import { RecordModelSchema } from "../record-model.schema";
import { parseStoredRecordModel } from "../stored-record-model";

describe("parseStoredRecordModel", () => {
  it("reads a model that a previous deployment stored with a membership authorization capability", () => {
    const companyId = randomUUID();
    const model = createCrmPreset(companyId);
    const stored = {
      ...model,
      capabilities: [
        ...model.capabilities,
        { id: randomUUID(), kind: "membershipAuthorization", typeId: presetId(companyId, "task"), fields: [] },
      ],
    };
    expect(RecordModelSchema.safeParse(stored).success).toBe(false);
    expect(parseStoredRecordModel(stored)).toEqual(RecordModelSchema.parse(model));
  });

  it("still refuses any other unknown capability", () => {
    const model = createCrmPreset(randomUUID());
    const stored = {
      ...model,
      capabilities: [{ id: randomUUID(), kind: "unknown", typeId: randomUUID(), fields: [] }],
    };
    expect(() => parseStoredRecordModel(stored)).toThrow();
  });
});
