import { describe, expect, it } from "vitest";

import { createCrmPreset, presetId } from "../crm-preset";
import { calculationResultType } from "../record-model-validation";

const company = "6487f9fb-7b10-439a-b783-9d3da8184b14";
const model = createCrmPreset(company);
const id = (key: string) => presetId(company, key);
const expressionOf = (key: string) => {
  const behavior = model.fields.find((field) => field.id === id(key))?.behavior;
  if (!behavior || behavior.kind === "input") throw new Error(`${key} is not calculated`);
  return behavior.expression;
};

describe("calculation result type", () => {
  it("derives the stored value type of every starter calculation", () => {
    for (const field of model.fields) {
      if (field.behavior.kind === "input") continue;
      expect(calculationResultType(field.behavior.expression, field.typeId, model), field.label).toBe(field.valueType);
    }
  });

  it("counts as a number and follows money through sums and lookups", () => {
    expect(
      calculationResultType(
        {
          kind: "related",
          relationId: id("lineItem.deal"),
          direction: "incoming",
          reducer: "count",
          expression: { kind: "literal", value: null },
        },
        id("deal"),
        model,
      ),
    ).toBe("number");
    expect(calculationResultType(expressionOf("deal.totalValue"), id("deal"), model)).toBe("currency");
    expect(calculationResultType(expressionOf("lineItem.savedPrice"), id("lineItem"), model)).toBe("currency");
  });

  it("returns no type for an incomplete or invalid expression", () => {
    expect(calculationResultType({ kind: "literal", value: null }, id("deal"), model)).toBeNull();
    expect(calculationResultType({ kind: "field", fieldId: id("contact.firstName") }, id("deal"), model)).toBeNull();
  });
});
