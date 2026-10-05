import { recordInvariant } from "@/features/records/record-invariant";
import { describe, expect, it } from "vitest";
import type { CalculationExpression } from "@/features/records/record-model.schema";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { expressionAt, expressionTypeId, replaceExpression, expressionSummary } from "../calculation-editor";

const company = "6487f9fb-7b10-439a-b783-9d3da8184b14";
const model = createCrmPreset(company, "EUR");
const id = (key: string) => presetId(company, key);
const weighted = recordInvariant(model.fields.find((field) => field.id === id("deal.weightedValue")));
const expression = weighted.behavior.kind === "input" ? null : weighted.behavior.expression;

describe("linear calculation editing", () => {
  it("changes a deep input without changing sibling expressions or stable field references", () => {
    const source = recordInvariant(expression);
    const replacement: CalculationExpression = {
      kind: "literal",
      value: { kind: "decimal", value: "50", currency: null },
    };
    const next = replaceExpression(source, [0, 1], replacement);
    expect(expressionAt(next, [0, 1])).toEqual(replacement);
    expect(expressionAt(next, [0, 0])).toBe(expressionAt(source, [0, 0]));
    expect(expressionAt(next, [1])).toBe(expressionAt(source, [1]));
    expect(expressionAt(source, [0, 1])?.kind).toBe("optionAttribute");
  });
  it("keeps related-field selection in the endpoint type and respects incoming direction", () => {
    const source: CalculationExpression = {
      kind: "related",
      relationId: id("lineItem.deal"),
      direction: "incoming",
      reducer: "sum",
      expression: { kind: "field", fieldId: id("lineItem.amount") },
    };
    expect(expressionTypeId(source, ["expression"], id("deal"), model)).toBe(id("lineItem"));
    expect(expressionAt(source, ["expression"])).toEqual({ kind: "field", fieldId: id("lineItem.amount") });
  });
  it("preserves expressions for stale navigation paths", () => {
    expect(expressionAt(recordInvariant(expression), [42])).toBeNull();
    expect(replaceExpression(recordInvariant(expression), [42], { kind: "literal", value: null })).toBe(expression);
  });
  it("renders renamed field labels and friendly select literals without exposing IDs", () => {
    const renamed = {
      ...model,
      fields: model.fields.map((field) =>
        field.id === id("deal.totalValue") ? { ...field, label: "Revenue" } : field,
      ),
    };
    const summary = expressionSummary(recordInvariant(expression), renamed, (key) => key);
    expect(summary).toContain("Revenue");
    expect(summary).not.toContain(id("deal.totalValue"));
    expect(expressionSummary({ kind: "literal", value: { kind: "select", value: "saved" } }, model, (key) => key)).toBe(
      "Saved price",
    );
  });
  it("retains currency and missing values rather than collapsing them to zero", () => {
    expect(expressionSummary({ kind: "literal", value: null }, model, (key) => key)).toBe("missing");
    expect(
      expressionSummary(
        { kind: "literal", value: { kind: "decimal", value: "0", currency: "EUR" } },
        model,
        (key) => key,
      ),
    ).toBe("0 EUR");
  });
});
