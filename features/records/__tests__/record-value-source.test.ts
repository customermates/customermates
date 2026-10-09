import { describe, expect, it } from "vitest";

import type { RecordField, RecordModelView } from "../record-model.schema";

import { createCrmPreset, presetId } from "../crm-preset";
import { calculationSentence, sentenceText } from "../calculation-sentence";
import { recordValueSource } from "../record-value-source";

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
      "RecordModel.valueSource.calculated": "Calculated · {formula}",
      "RecordModel.valueSource.from": "From {list} · {value}",
      "RecordModel.valueSource.savedOnCreate": "Saved when the {list} is created",
      "RecordModel.valueSource.savedOnRequest": "Saved on request",
      "RecordModel.valueSource.savedWhenChanged": "Saved when {field} changes",
      "RecordModel.valueSource.savedWhenChangedTo": "Saved when {field} changes to {value}",
    }[key] ?? key,
  );
type SourceField = Parameters<typeof recordValueSource>[0]["field"];
const source = (field: SourceField) => recordValueSource({ model, field, t });
const calculated = model.fields.filter((field) => field.behavior.kind !== "input");
const ofShape = (match: (described: NonNullable<ReturnType<typeof calculationSentence>>) => boolean) =>
  calculated.find((field) => {
    const described = calculationSentence({ model, field, t });
    return described !== null && described.saved === null && match(described);
  });

describe("record value source line", () => {
  it("names input fields nothing and every starter calculation without placeholders", () => {
    expect(source(fieldOf("deal.name"))).toBeNull();
    for (const field of calculated) {
      const text = sentenceText(source(field)?.segments ?? []);
      expect(text, field.label).toMatch(/^(Calculated · |From |Saved )/);
      expect(text, field.label).not.toMatch(/\{|\}|\u0000|undefined/);
    }
  });

  it("shows a formula as Calculated with the formula only and a rollup with its sentence", () => {
    const formula = ofShape((described) => described.reducer === null);
    const formulaText = sentenceText(source(formula as RecordField)?.segments ?? []);
    expect(formulaText.startsWith("Calculated · ")).toBe(true);
    expect(formulaText).not.toContain("is calculated as");
    expect(sentenceText(source(fieldOf("deal.totalValue"))?.segments ?? [])).toBe(
      "Calculated · Value adds up the Amount of all linked Line items.",
    );
  });

  it("shows a lookup as From with its list chip and the single hop to open the linked record", () => {
    const snapshot = fieldOf("lineItem.savedPrice");
    if (snapshot.behavior.kind !== "snapshot") throw new Error("The saved price is a snapshot");
    const lookup = {
      ...snapshot,
      behavior: { kind: "lookup", expression: snapshot.behavior.expression },
    } as RecordField;
    const result = source(lookup);
    expect(sentenceText(result?.segments ?? [])).toMatch(/^From .+ · .+$/);
    expect(result?.segments.some((segment) => typeof segment !== "string" && segment.kind === "list")).toBe(true);
    expect(result?.lookup).toMatchObject({ relationId: expect.any(String), direction: expect.any(String) });
  });

  it("shows when a snapshot is saved, with its trigger field as a reference", () => {
    const result = source(fieldOf("lineItem.savedPrice"));
    expect(sentenceText(result?.segments ?? [])).toBe("Saved when Pricing changes to Saved price");
    expect(result?.segments).toContainEqual({ kind: "field", id: id("lineItem.pricingMode"), label: "Pricing" });
  });

  it("gives readers without the formula no calculation line", () => {
    const field = fieldOf("deal.totalValue");
    const hidden = { ...field, behavior: { ...field.behavior, expression: undefined } } as unknown as RecordField;
    expect(source(hidden)).toBeNull();
  });
});
