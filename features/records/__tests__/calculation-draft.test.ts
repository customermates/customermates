import { describe, expect, it } from "vitest";

import type { RecordModelView } from "../record-model.schema";

import { createCrmPreset, presetId } from "../crm-preset";
import { calculationDraftRequest, parseCalculationDraft } from "../calculation-draft";

const company = "6487f9fb-7b10-439a-b783-9d3da8184b14";
const model = { ...createCrmPreset(company), capabilities: [] } as unknown as RecordModelView;
const id = (key: string) => presetId(company, key);
const request = (fieldId?: string) =>
  calculationDraftRequest({ model, typeId: id("deal"), fieldId, description: "Total of the line item amounts" });
const alias = (aliases: Map<string, string>, value: string) =>
  [...aliases].find(([, entry]) => entry === value)?.[0] ?? "";

describe("calculation draft request", () => {
  it("lists names behind short aliases and sends no ids or record data", () => {
    const { prompt, aliases } = request();
    expect(prompt).toContain("This list: Deal");
    expect(prompt).toContain("Line items");
    expect(prompt).toContain("Amount");
    expect(prompt).toContain("Total of the line item amounts");
    expect(prompt).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(aliases.get(alias(aliases, id("lineItem.amount")))).toBe(id("lineItem.amount"));
  });

  it("leaves the edited field out so a draft cannot refer to itself", () => {
    expect(request(id("deal.totalValue")).aliases.size).toBeLessThan(request().aliases.size);
  });
});

describe("calculation draft parsing", () => {
  const { aliases } = request();
  const parse = (expression: unknown, source: "formula" | "lookup" | "rollup" = "formula") =>
    parseCalculationDraft({
      output: { source, expression: JSON.stringify(expression) },
      aliases,
      model,
      typeId: id("deal"),
    });

  it("maps aliases back and derives the source from the expression", () => {
    const draft = parse(
      {
        kind: "related",
        relationId: alias(aliases, id("lineItem.deal")),
        direction: "incoming",
        reducer: "sum",
        expression: { kind: "field", fieldId: alias(aliases, id("lineItem.amount")) },
      },
      "formula",
    );
    expect(draft).toEqual({
      source: "rollup",
      expression: {
        kind: "related",
        relationId: id("lineItem.deal"),
        direction: "incoming",
        reducer: "sum",
        expression: { kind: "field", fieldId: id("lineItem.amount") },
      },
    });
  });

  it("rejects invented references, type mismatches, unparsable answers and explicit refusals", () => {
    expect(parse({ kind: "field", fieldId: "f999" })).toBeNull();
    expect(
      parse({
        kind: "operation",
        operator: "add",
        arguments: [
          { kind: "field", fieldId: alias(aliases, id("deal.name")) },
          { kind: "field", fieldId: alias(aliases, id("deal.totalValue")) },
        ],
      }),
    ).toBeNull();
    expect(
      parseCalculationDraft({
        output: { source: "formula", expression: "{not json" },
        aliases,
        model,
        typeId: id("deal"),
      }),
    ).toBeNull();
    expect(
      parseCalculationDraft({ output: { source: "formula", expression: "null" }, aliases, model, typeId: id("deal") }),
    ).toBeNull();
  });

  it("rejects wrong-list fields and empty inputs inside counts and comparisons", () => {
    const lineItems = {
      kind: "related",
      relationId: alias(aliases, id("lineItem.deal")),
      direction: "incoming",
      reducer: "count",
    };
    expect(parse({ ...lineItems, expression: { kind: "literal", value: null } })).not.toBeNull();
    expect(parse({ ...lineItems, expression: { kind: "field", fieldId: alias(aliases, id("deal.name")) } })).toBeNull();
    expect(
      parse({
        kind: "operation",
        operator: "equal",
        arguments: [
          { kind: "field", fieldId: alias(aliases, id("lineItem.amount")) },
          { kind: "literal", value: { kind: "decimal", value: "1", currency: null } },
        ],
      }),
    ).toBeNull();
    expect(
      parse({
        kind: "operation",
        operator: "equal",
        arguments: [
          { kind: "field", fieldId: alias(aliases, id("deal.name")) },
          { kind: "literal", value: null },
        ],
      }),
    ).toBeNull();
  });

  it("refuses a draft that reaches the edited field through another calculated field", () => {
    const edited = id("deal.totalValue");
    const { prompt, aliases: editAliases } = request(edited);
    expect(prompt).not.toContain("Weighted value");
    expect(
      parseCalculationDraft({
        output: {
          source: "formula",
          expression: JSON.stringify({ kind: "field", fieldId: id("deal.weightedValue") }),
        },
        aliases: editAliases,
        model,
        typeId: id("deal"),
        fieldId: edited,
      }),
    ).toBeNull();
  });

  it("refuses a draft that uses the field being edited", () => {
    const field = id("deal.totalValue");
    expect(
      parseCalculationDraft({
        output: { source: "formula", expression: JSON.stringify({ kind: "field", fieldId: field }) },
        aliases,
        model,
        typeId: id("deal"),
        fieldId: field,
      }),
    ).toBeNull();
  });
});
