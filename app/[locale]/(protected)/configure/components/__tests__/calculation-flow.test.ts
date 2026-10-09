import { describe, expect, it } from "vitest";

import { aggregateOf, linkedExpression, linkedFlow } from "@/features/records/calculation-sentence";
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
  issueText,
  derivedValueType,
  expressionAt,
  formulaInputs,
  formulaSteps,
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
const missing = (source: "formula" | "lookup" | "rollup", expression: CalculationExpression, typeId: string) => {
  const issue = calculationIssues(source, expression, typeId, model)[0];
  return issue ? issueText(issue, t, (operator) => operator) : null;
};
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
      expect(calculationBehavior(draft), field.label).toEqual(behavior);
    }
    for (const kind of ["formula", "lookup", "rollup"] as const) {
      const behavior = { kind, expression: amountTotal };
      expect(calculationBehavior(calculationDraft(behavior))).toEqual(behavior);
    }
    const withoutOverride = { kind: "snapshot" as const, expression: amountTotal, capture: "create" as const };
    expect(calculationBehavior(calculationDraft(withoutOverride))).toEqual(withoutOverride);
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
      allowManualOverride: undefined,
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

describe("stored path shapes", () => {
  const hop = (reducer: "one" | "sum" | "count" | "average" | "min" | "max", relation = "lineItem.deal") => ({
    relationId: id(relation),
    direction: "incoming" as const,
    reducer,
  });
  const shapes: Array<[string, ReturnType<typeof hop>[], "lookup" | "rollup"]> = [
    ["one", [hop("one")], "lookup"],
    ["one, one", [hop("one"), hop("one", "lineItem.service")], "lookup"],
    ["sum", [hop("sum")], "rollup"],
    ["sum, one", [hop("sum"), hop("one", "lineItem.service")], "rollup"],
    ["one, sum", [hop("one", "lineItem.service"), hop("sum")], "rollup"],
    ["sum, sum", [hop("sum"), hop("sum", "lineItem.service")], "rollup"],
    ["count", [hop("count")], "rollup"],
    ["sum, count", [hop("sum"), hop("count", "lineItem.service")], "rollup"],
    ["max, one", [hop("max"), hop("one", "lineItem.service")], "rollup"],
  ];
  const value: CalculationExpression = { kind: "field", fieldId: id("service.amount") };

  it.each(shapes)("round-trips %s live and as a snapshot with its real source", (_, hops, source) => {
    const expression = linkedExpression({ hops, value });
    for (const behavior of [
      { kind: source, expression },
      { kind: "snapshot" as const, expression, capture: "explicit" as const },
    ]) {
      const draft = calculationDraft(behavior);
      expect(draft.source).toBe(source);
      expect(calculationBehavior(draft)).toEqual(behavior);
      const flow = linkedFlow(expression);
      expect(withAggregate(flow, aggregateOf(flow)).hops).toEqual(hops);
    }
  });

  it("keeps singular hops as one when the aggregate changes", () => {
    const flow = { hops: [hop("sum"), hop("one", "lineItem.service")], value };
    expect(aggregateOf(flow)).toBe("sum");
    expect(withAggregate(flow, "max").hops.map((entry) => entry.reducer)).toEqual(["max", "one"]);
    expect(withAggregate(flow, "count").hops.map((entry) => entry.reducer)).toEqual(["count", "one"]);
    expect(withAggregate({ hops: [hop("one")], value }, "sum").hops.map((entry) => entry.reducer)).toEqual(["sum"]);
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
    expect(withAggregate(flow, "count").value).toEqual(UNSET);
    expect(withAggregate(flow, "max").value).toBe(flow.value);
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
    expect(derivedValueType(expressionOf("lineItem.savedPrice"), id("lineItem"), model)).toMatchObject({
      valueType: "currency",
      currency: fieldOf("service.amount").format?.currency ?? null,
    });
    expect(derivedValueType(amountTotal, id("deal"), model)).toMatchObject({ valueType: "currency" });
    expect(derivedValueType({ ...amountTotal, reducer: "count" }, id("deal"), model)).toMatchObject({
      valueType: "number",
      currency: null,
    });
    expect(derivedValueType(expressionOf("deal.totalQuantity"), id("deal"), model)).toMatchObject({
      valueType: "number",
      currency: null,
    });
  });

  it("carries the options of a looked up choice field", () => {
    const stage: CalculationExpression = {
      kind: "related",
      relationId: id("lineItem.deal"),
      direction: "outgoing",
      reducer: "one",
      expression: { kind: "field", fieldId: id("deal.stage") },
    };
    expect(derivedValueType(stage, id("lineItem"), model)).toMatchObject({
      valueType: "select",
      options: fieldOf("deal.stage").options,
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

describe("missing parts", () => {
  it("names what is missing while the flow is incomplete", () => {
    const pick = { ...amountTotal, expression: UNSET };
    expect(missing("rollup", pick, id("deal"))).toBe("missing.sum");
    expect(missing("lookup", { ...pick, reducer: "one" }, id("lineItem"))).toBe("missing.take");
    expect(missing("rollup", { ...pick, reducer: "count" }, id("deal"))).toBeNull();
    expect(missing("lookup", UNSET, id("deal"))).toBe("missing.relationship");
    expect(missing("formula", { kind: "operation", operator: "add", arguments: [UNSET, UNSET] }, id("deal"))).toBe(
      'missing.step{"operation":"add"}',
    );
    expect(calculationIssues("formula", UNSET, id("deal"), model)).toEqual([{ node: "input" }]);
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
