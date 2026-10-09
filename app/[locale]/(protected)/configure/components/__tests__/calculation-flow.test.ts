import { describe, expect, it } from "vitest";

import type { CalculationExpression, RecordField } from "@/features/records/record-model.schema";

import { recordInvariant } from "@/features/records/record-invariant";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";

import {
  UNSET,
  addInput,
  addStep,
  calculationBehavior,
  calculationDraft,
  calculationIssues,
  calculationSentence,
  derivedValueType,
  expressionAt,
  formulaInputs,
  formulaSteps,
  linkedExpression,
  linkedFlow,
  removeStep,
  replaceExpression,
  withAggregate,
  withOperator,
} from "../calculation-flow";

const company = "6487f9fb-7b10-439a-b783-9d3da8184b14";
const model = { ...createCrmPreset(company), capabilities: [] } as unknown as Parameters<typeof derivedValueType>[2];
const id = (key: string) => presetId(company, key);
const fieldOf = (key: string) => recordInvariant(model.fields.find((field) => field.id === id(key))) as RecordField;
const expressionOf = (key: string) => {
  const behavior = fieldOf(key).behavior;
  if (behavior.kind === "input") throw new Error(`${key} is not calculated`);
  return behavior.expression;
};
const t = (key: string, values: Record<string, string> = {}) =>
  `${key.replace("RecordModel.calculationFlow.", "")}${Object.keys(values).length ? JSON.stringify(values) : ""}`;
const sentence = (
  source: "formula" | "lookup" | "rollup",
  expression: CalculationExpression,
  typeId: string,
  updates: "live" | "create" | "whenChanged" | "explicit" = "live",
) =>
  calculationSentence(
    {
      source,
      expression,
      typeId,
      field: "Result",
      updates,
      allowManualOverride: true,
      trigger: { field: "Pricing", value: "Saved price" },
    },
    { model, t, operatorLabel: (operator) => operator },
  );
const amountTotal: CalculationExpression = {
  kind: "related",
  relationId: id("lineItem.deal"),
  direction: "incoming",
  reducer: "sum",
  expression: { kind: "field", fieldId: id("lineItem.amount") },
};

describe("value source and updates mapping", () => {
  it("round-trips every stored behavior, a snapshot included", () => {
    for (const field of model.fields) {
      const behavior = (field as RecordField).behavior;
      if (behavior.kind === "input") continue;
      const draft = calculationDraft(behavior);
      expect(calculationBehavior(draft), field.label).toEqual(
        behavior.kind === "snapshot"
          ? { ...behavior, allowManualOverride: behavior.allowManualOverride ?? false }
          : behavior,
      );
    }
    for (const kind of ["formula", "lookup", "rollup"] as const) {
      const behavior = { kind, expression: amountTotal };
      expect(calculationBehavior(calculationDraft(behavior))).toEqual(behavior);
    }
    for (const capture of ["create", "explicit"] as const) {
      const behavior = { kind: "snapshot" as const, expression: amountTotal, capture, allowManualOverride: false };
      expect(calculationBehavior(calculationDraft(behavior))).toEqual(behavior);
    }
  });

  it("maps a snapshot to the source of its expression plus the matching Updates mode", () => {
    const saved = fieldOf("lineItem.savedPrice").behavior;
    if (saved.kind !== "snapshot") throw new Error("Saved unit price is a snapshot");
    expect(calculationDraft(saved)).toMatchObject({
      source: "lookup",
      updates: "whenChanged",
      allowManualOverride: true,
      triggerFieldId: id("lineItem.pricingMode"),
    });
    expect(calculationDraft({ kind: "snapshot", expression: amountTotal, capture: "create" })).toMatchObject({
      source: "rollup",
      updates: "create",
      allowManualOverride: false,
    });
    expect(
      calculationDraft({ kind: "snapshot", expression: expressionOf("deal.weightedValue"), capture: "explicit" }),
    ).toMatchObject({ source: "formula", updates: "explicit" });
  });

  it("writes a live calculation without snapshot options and a saved one with them", () => {
    const draft = {
      source: "lookup" as const,
      expression: amountTotal,
      allowManualOverride: true,
      triggerFieldId: id("lineItem.pricingMode"),
      triggerValue: { kind: "select" as const, value: "saved" },
    };
    expect(calculationBehavior({ ...draft, updates: "live" })).toEqual({ kind: "lookup", expression: amountTotal });
    expect(calculationBehavior({ ...draft, updates: "create" })).toEqual({
      kind: "snapshot",
      expression: amountTotal,
      capture: "create",
      allowManualOverride: true,
    });
    expect(calculationBehavior({ ...draft, updates: "whenChanged" })).toMatchObject({
      triggerFieldId: id("lineItem.pricingMode"),
      triggerValue: { kind: "select", value: "saved" },
    });
  });
});

describe("linked flow", () => {
  it("splits a chain into hops and a value and rebuilds it unchanged", () => {
    const chain: CalculationExpression = {
      kind: "related",
      relationId: id("deal.contacts"),
      direction: "outgoing",
      reducer: "sum",
      expression: { ...amountTotal, relationId: id("contact.organizations"), direction: "outgoing", reducer: "count" },
    };
    const flow = linkedFlow(chain);
    expect(flow.hops.map((hop) => hop.reducer)).toEqual(["sum", "count"]);
    expect(linkedExpression(flow)).toEqual(chain);
  });

  it("aggregates the last hop and carries a matching reducer through the outer hops", () => {
    const flow = linkedFlow({ kind: "related", ...linkedFlow(amountTotal).hops[0], expression: amountTotal });
    expect(withAggregate(flow, "count").hops.map((hop) => hop.reducer)).toEqual(["sum", "count"]);
    expect(withAggregate(flow, "max").hops.map((hop) => hop.reducer)).toEqual(["max", "max"]);
    expect(withAggregate(flow, "one").hops.map((hop) => hop.reducer)).toEqual(["one", "one"]);
  });
});

describe("formula steps", () => {
  it("orders nested operations as steps before the step that uses them", () => {
    const steps = formulaSteps(expressionOf("contact.name"));
    expect(steps.map((step) => step.operator)).toEqual(["coalesce", "coalesce", "concat", "trim"]);
    expect(steps[2].arguments.map((argument) => argument.step)).toEqual([0, null, 1]);
    expect(steps[3].arguments[0].step).toBe(2);
    expect(formulaInputs(expressionOf("contact.name")).map((input) => input.expression.kind)).toEqual([
      "field",
      "literal",
      "literal",
      "field",
      "literal",
    ]);
  });

  it("adds, rewires and removes steps without touching sibling inputs", () => {
    const weighted = expressionOf("deal.weightedValue");
    const added = addStep(weighted, "add");
    expect(added).toEqual({ kind: "operation", operator: "add", arguments: [weighted, UNSET] });
    const replaced = replaceExpression(added, [1], {
      kind: "literal",
      value: { kind: "decimal", value: "5", currency: null },
    });
    expect(expressionAt(replaced, [0])).toBe(weighted);
    expect(removeStep(replaced, [])).toBe(weighted);
    expect(removeStep(weighted, [0])).toEqual({
      ...weighted,
      arguments: [{ kind: "field", fieldId: id("deal.totalValue") }, expressionAt(weighted, [1])],
    });
  });

  it("pads and trims arguments when the operation changes and grows variadic steps", () => {
    const pair: CalculationExpression = { kind: "operation", operator: "add", arguments: [UNSET, UNSET] };
    if (pair.kind !== "operation") throw new Error("operation");
    expect(withOperator(pair, "if").arguments).toHaveLength(3);
    expect(withOperator(pair, "trim").arguments).toHaveLength(1);
    const joined = addInput({ kind: "operation", operator: "concat", arguments: [UNSET, UNSET] }, "add");
    expect(joined.kind === "operation" && joined.arguments).toHaveLength(3);
    expect(addInput({ kind: "field", fieldId: id("deal.totalValue") }, "add")).toMatchObject({ operator: "add" });
  });
});

describe("derived value type", () => {
  it("takes the looked up field's type, money for money sums and a number for counts", () => {
    expect(derivedValueType(expressionOf("lineItem.savedPrice"), id("lineItem"), model)).toEqual({
      valueType: "currency",
      currency: fieldOf("service.amount").format?.currency ?? null,
    });
    expect(derivedValueType(amountTotal, id("deal"), model)).toMatchObject({ valueType: "currency" });
    expect(derivedValueType({ ...amountTotal, reducer: "count" }, id("deal"), model)).toEqual({
      valueType: "number",
      currency: null,
    });
    expect(derivedValueType(expressionOf("deal.totalQuantity"), id("deal"), model)).toEqual({
      valueType: "number",
      currency: null,
    });
  });

  it("uses the last step's result type for formulas and nothing for incomplete ones", () => {
    expect(derivedValueType(expressionOf("contact.name"), id("contact"), model)?.valueType).toBe("text");
    expect(derivedValueType(expressionOf("deal.weightedValue"), id("deal"), model)?.valueType).toBe("currency");
    expect(
      derivedValueType({ kind: "operation", operator: "equal", arguments: [UNSET, UNSET] }, id("deal"), model)
        ?.valueType,
    ).toBe("boolean");
    expect(derivedValueType(UNSET, id("deal"), model)).toBeNull();
  });
});

describe("calculation sentence", () => {
  it("describes every starter calculation without holes or trailing separators", () => {
    for (const field of model.fields) {
      const behavior = (field as RecordField).behavior;
      if (behavior.kind === "input") continue;
      const draft = calculationDraft(behavior);
      const text = sentence(draft.source, draft.expression, field.typeId, draft.updates);
      expect(text, field.label).not.toMatch(/\s(of|the)\s(of|the)\s|""|·\s*$|undefined|null|\{\}/);
      expect(text).not.toMatch(/missing\./);
    }
    expect(sentence("rollup", amountTotal, id("deal"))).toBe(
      'sentence.sum{"field":"Result","value":"Amount","list":"Line items"}',
    );
  });

  it("names what is missing while the flow is incomplete", () => {
    const pick = { ...amountTotal, expression: UNSET };
    expect(sentence("rollup", pick, id("deal"))).toBe("missing.sum");
    expect(sentence("lookup", { ...pick, reducer: "one" }, id("lineItem"))).toBe("missing.take");
    expect(sentence("rollup", { ...pick, reducer: "count" }, id("deal"))).toBe(
      'sentence.count{"field":"Result","list":"Line items"}',
    );
    expect(sentence("lookup", UNSET, id("deal"))).toBe("missing.relationship");
    expect(sentence("formula", { kind: "operation", operator: "add", arguments: [UNSET, UNSET] }, id("deal"))).toBe(
      'missing.step{"operation":"add"}',
    );
    expect(calculationIssues("formula", UNSET, id("deal"), model)).toEqual([{ node: "input" }]);
  });

  it("adds the saving moment and the manual override for saved calculations", () => {
    const text = sentence("lookup", expressionOf("lineItem.savedPrice"), id("lineItem"), "whenChanged");
    expect(text).toContain('sentence.savedWhenChangedTo{"field":"Pricing","value":"Saved price"}');
    expect(text).toContain("sentence.typeOver");
    expect(sentence("lookup", expressionOf("lineItem.savedPrice"), id("lineItem"), "live")).not.toContain("typeOver");
  });

  it("flags a complete flow whose values don't fit together", () => {
    const mismatch: CalculationExpression = {
      kind: "operation",
      operator: "add",
      arguments: [
        { kind: "field", fieldId: id("deal.name") },
        { kind: "field", fieldId: id("deal.totalValue") },
      ],
    };
    expect(calculationIssues("formula", mismatch, id("deal"), model)).toEqual([{ node: "result" }]);
  });
});
