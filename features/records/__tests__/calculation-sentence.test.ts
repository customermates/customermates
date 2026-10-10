import { describe, expect, it } from "vitest";

import type { RecordField, RecordModelView } from "../record-model.schema";

import { createCrmPreset, presetId } from "../crm-preset";
import { calculationSentence, expressionSegments, literalText, sentenceText } from "../calculation-sentence";

const company = "6487f9fb-7b10-439a-b783-9d3da8184b14";
const model = { ...createCrmPreset(company), capabilities: [] } as unknown as RecordModelView;
const id = (key: string) => presetId(company, key);
const fieldOf = (key: string) => model.fields.find((field) => field.id === id(key)) as RecordField;
const t = (key: string, values: Record<string, string> = {}) =>
  Object.entries(values).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, value),
    {
      "RecordModel.calculationFlow.sentence.formula": "{field} is calculated as {formula}.",
      "RecordModel.calculationFlow.sentence.lookup": "{field} shows the {value} of the linked {list}.",
      "RecordModel.calculationFlow.sentence.sum": "{field} adds up the {value} of all linked {list}.",
      "RecordModel.calculationFlow.sentence.count": "{field} counts the linked {list}.",
      "RecordModel.calculationFlow.sentence.throughList": "{list} of the {via}",
      "RecordModel.calculationFlow.text.linkedValue": "{list} {value}",
      "RecordModel.calculationFlow.text.sum": "sum of {value} across linked {list}",
      "RecordModel.calculationFlow.text.if": "if {condition} then {then}, otherwise {otherwise}",
      "RecordModel.operators.coalesce": "First available value",
      "RecordModel.probability": "Probability",
      "RecordModel.relationship": "Relationship",
    }[key] ?? key,
  );
const format = {
  decimal: (value: string, { currency }: { currency: string | null }) => `${value}${currency ? ` ${currency}` : ""}`,
  isoDate: (value: string, dateOnly: boolean) => `${dateOnly ? "date" : "time"} ${value}`,
};
const describe_ = (key: string) => calculationSentence({ model, field: fieldOf(key), t, format });

describe("shared calculation sentence", () => {
  it("describes every starter calculation without holes or leftover placeholders", () => {
    for (const field of model.fields) {
      const described = calculationSentence({ model, field, t, format });
      if (field.behavior.kind === "input") {
        expect(described).toBeNull();
        continue;
      }
      const text = sentenceText(described?.sentence ?? []);
      expect(text, field.label).not.toMatch(/\{|\}|\u0000|undefined|null|\bthe of the\b|\bthe the\b|\bof of\b|·\s*$/);
      expect(text.startsWith(field.label)).toBe(true);
    }
  });

  it("returns list and field references with their ids for chips", () => {
    const value = describe_("deal.totalValue");
    expect(sentenceText(value?.sentence ?? [])).toBe("Value adds up the Amount of all linked Line items.");
    expect(value?.sentence).toContainEqual({
      kind: "field",
      id: id("lineItem.amount"),
      label: "Amount",
      typeId: id("lineItem"),
    });
    expect(value?.list).toEqual([
      {
        kind: "list",
        id: id("lineItem"),
        label: "Line items",
        icon: model.types.find((type) => type.id === id("lineItem"))?.icon,
      },
    ]);
    expect(value?.reducer).toBe("sum");
  });

  it("separates a snapshot's saved clause from the calculation and keeps its trigger as a reference", () => {
    const saved = describe_("lineItem.savedPrice");
    expect(sentenceText(saved?.sentence ?? [])).toBe("Saved unit price shows the Price of the linked Service.");
    expect(saved?.saved).toEqual({
      kind: "whenChanged",
      field: { kind: "field", id: id("lineItem.pricingMode"), label: "Pricing", typeId: id("lineItem") },
      value: "Saved price",
    });
    expect(saved?.typeOver).toBe(true);
    expect(describe_("deal.totalValue")?.saved).toBeNull();
  });

  it("keeps the saved clause but no calculation for readers without the formula", () => {
    const field = fieldOf("lineItem.savedPrice");
    if (field.behavior.kind !== "snapshot") throw new Error("snapshot expected");
    const restricted = { ...field, behavior: { kind: "snapshot" as const, capture: "create" as const } };
    expect(calculationSentence({ model, field: restricted, t, format })).toEqual({
      sentence: null,
      value: null,
      list: null,
      reducer: null,
      saved: { kind: "create" },
      typeOver: false,
    });
  });

  const context = {
    model,
    t,
    format,
    operatorLabel: (operator: string) => t(`RecordModel.operators.${operator}`),
  };

  it("names option attributes by their label", () => {
    const text = sentenceText(
      expressionSegments(
        { kind: "optionAttribute", fieldId: id("deal.stage"), attribute: "probability" },
        id("deal"),
        context,
      ),
    );
    expect(text).toBe("Stage Probability");
  });

  it("keeps every middle list on paths of three hops and names a missing list by its relationship", () => {
    const path = {
      kind: "related" as const,
      relationId: id("contact.organizations"),
      direction: "incoming" as const,
      reducer: "sum" as const,
      expression: {
        kind: "related" as const,
        relationId: id("deal.contacts"),
        direction: "incoming" as const,
        reducer: "sum" as const,
        expression: {
          kind: "related" as const,
          relationId: id("lineItem.deal"),
          direction: "incoming" as const,
          reducer: "sum" as const,
          expression: { kind: "field" as const, fieldId: id("lineItem.amount") },
        },
      },
    };
    const text = sentenceText(expressionSegments(path, id("organization"), context));
    expect(text).toContain("Line items of the Deal of the Contact");
    const withoutDeals = { ...model, types: model.types.filter((type) => type.id !== id("deal")) };
    const missing = sentenceText(expressionSegments(path, id("organization"), { ...context, model: withoutDeals }));
    expect(missing).not.toMatch(/the\s+of|linked\s*\./);
    expect(missing).toContain("of the Deals");
  });

  it("formats numbers, money and dates through the shared value formatters at full precision", () => {
    expect(literalText({ kind: "decimal", value: "1234.56789012", currency: "EUR" }, model, t, format)).toBe(
      "1234.56789012 EUR",
    );
    expect(literalText({ kind: "decimal", value: "0.125", currency: null }, model, t, format)).toBe("0.125");
    expect(literalText({ kind: "date", value: "2026-03-02" }, model, t, format)).toBe("date 2026-03-02");
    expect(literalText({ kind: "dateTime", value: "2026-03-02T09:30:00Z" }, model, t, format)).toBe(
      "time 2026-03-02T09:30:00Z",
    );
  });

  it("does not double the parentheses inside and, or and first available value", () => {
    const text = sentenceText(
      expressionSegments(
        {
          kind: "operation",
          operator: "coalesce",
          arguments: [
            {
              kind: "operation",
              operator: "add",
              arguments: [
                { kind: "field", fieldId: id("deal.totalValue") },
                { kind: "literal", value: { kind: "decimal", value: "1", currency: null } },
              ],
            },
            { kind: "literal", value: { kind: "decimal", value: "0", currency: null } },
          ],
        },
        id("deal"),
        context,
      ),
    );
    expect(text).toBe("First available value (Value + 1, 0)");
  });
});
