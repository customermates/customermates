import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RecordField, RecordModel } from "../record-model.schema";

import { createCrmPreset, presetId } from "../crm-preset";
import { validateRecordModel } from "../record-model-validation";
import { RecordFieldSchema } from "../record-model.schema";

const workspace = randomUUID();
const typeId = presetId(workspace, "contact");
const field = (valueType: RecordField["valueType"], onClick: "open" | "copy" | null | undefined): RecordField => ({
  id: randomUUID(),
  typeId,
  label: `Contact ${valueType}`,
  valueType,
  behavior: { kind: "input" },
  required: false,
  archived: false,
  publishedSummary: false,
  position: 30,
  options: [],
  ...(onClick === undefined ? {} : { format: { onClick } }),
});
const issues = (extra: RecordField) => {
  const model: RecordModel = createCrmPreset(workspace);
  return validateRecordModel({ ...model, fields: [...model.fields, extra] }).issues;
};

describe("contact value click actions", () => {
  it("accept open, copy, null and an omitted setting on email, phone and web fields", () => {
    for (const valueType of ["email", "phone", "url"] as const) {
      for (const onClick of ["open", "copy", null, undefined] as const) {
        const candidate = field(valueType, onClick);
        expect(RecordFieldSchema.safeParse(candidate).success).toBe(true);
        expect(issues(candidate)).not.toContainEqual(expect.objectContaining({ code: "invalid_click_action" }));
      }
    }
  });

  it("reject unknown actions and an action on any other field type", () => {
    expect(RecordFieldSchema.safeParse({ ...field("email", null), format: { onClick: "call" } }).success).toBe(false);
    const text = field("text", "copy");
    expect(issues(text)).toContainEqual({ code: "invalid_click_action", fieldId: text.id });
  });
});
