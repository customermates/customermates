import { describe, expect, it } from "vitest";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { recordInvariant } from "@/features/records/record-invariant";
import { ConfigurationChangeSchema } from "@/features/records/configuration.schema";
import {
  configureCounts,
  configureFieldOrder,
  configureFieldSource,
  configurePathLists,
  configureLists,
  moveConfigureField,
  reorderFieldOperations,
} from "../configure-model";
import { configureGraphLayout } from "../configure-graph-layout";
import { configureCalculationSources, configureCardinality, configureGraphData } from "../configure-graph-model";

const company = "6487f9fb-7b10-439a-b783-9d3da8184b14";
const id = (key: string) => presetId(company, key);

describe("configure lists", () => {
  it("orders lists by position with embedded lists directly after their parent", () => {
    const model = createCrmPreset(company);
    expect(configureLists(model).map((type) => type.pluralLabel)).toEqual([
      "Contacts",
      "Organizations",
      "Deals",
      "Line items",
      "Services",
      "Tasks",
    ]);
  });
});

describe("configure list details", () => {
  it("counts active fields and relationships", () => {
    const model = createCrmPreset(company);
    const counts = configureCounts(model, id("deal"));
    expect(counts.fields).toBe(model.fields.filter((field) => field.typeId === id("deal")).length);
    const deal = model.types.find((type) => type.id === id("deal"));
    expect(counts.relationships).toBe(
      model.relationships.filter((relation) => [relation.sourceTypeId, relation.targetTypeId].includes(id("deal")))
        .length + (deal?.relationshipPaths?.length ?? 0),
    );
  });

  it("describes calculated fields by their source list", () => {
    const model = createCrmPreset(company);
    const sources = model.fields
      .filter((field) => field.typeId === id("deal"))
      .map((field) => configureFieldSource(model, field));
    expect(sources).toContainEqual({ kind: "rollup", list: "Line items" });
    expect(sources).toContainEqual({ kind: "input" });
  });

  it("names the lists a relationship path passes through", () => {
    const model = createCrmPreset(company);
    const path = model.types.find((type) => type.id === id("deal"))?.relationshipPaths?.[0];
    expect(path && configurePathLists(model, id("deal"), path.path)).toEqual(["Line items", "Services"]);
    expect(configurePathLists(model, id("deal"), [])).toEqual([]);
  });
});

describe("field reordering", () => {
  it("moves a field and saves only changed positions as valid field operations", () => {
    const model = createCrmPreset(company);
    const order = configureFieldOrder(model, id("deal"));
    const moved = moveConfigureField(order, order[2], order[0]);
    expect(moved).toEqual([order[2], order[0], order[1], ...order.slice(3)]);
    expect(reorderFieldOperations(model, id("deal"), order)).toEqual([]);
    const operations = reorderFieldOperations(model, id("deal"), moved);
    const change = ConfigurationChangeSchema.parse({
      expectedRevision: 1,
      idempotencyKey: crypto.randomUUID(),
      operations,
    });
    expect(
      change.operations.map(
        (operation) => operation.operation === "putField" && [operation.field.id, operation.field.position],
      ),
    ).toEqual([
      [order[2], 0],
      [order[0], 1],
      [order[1], 2],
    ]);
  });

  it("renumbers every field when stored positions already match the requested order", () => {
    const model = createCrmPreset(company);
    const fields = model.fields.filter((field) => field.typeId === id("contact"));
    const order = fields.map((field) => field.id);
    fields[0].position = 1;
    fields[1].position = 0;
    const requested = [order[1], order[0], ...order.slice(2)];
    const operations = reorderFieldOperations(model, id("contact"), requested);
    expect(operations).toHaveLength(order.length);
    expect(operations.map((operation) => operation.operation === "putField" && operation.field.position)).toEqual(
      requested.map((_, index) => index + order.length),
    );
  });
});

describe("configure graph", () => {
  const account = {
    id: "3f0f8d4e-5a43-4c5b-9a4f-0c8a2c7d9b11",
    provider: "google",
    status: "ok",
    address: "max@example.com",
    hasMessaging: true,
    hasCalendar: false,
    linkedinProducts: [],
  };

  it("places every visible list once without overlap and draws each relationship", () => {
    const model = createCrmPreset(company);
    const data = configureGraphData(model, [], [account], false);
    const layout = configureGraphLayout(data, true, true);
    expect(layout.positions.size).toBe(model.types.length + 1);
    expect(data.lists.map((list) => list.type.id).sort()).toEqual(model.types.map((type) => type.id).sort());
    expect(data.edges.flatMap((edge) => (edge.kind === "relationship" ? [edge.relation.id] : [])).sort()).toEqual(
      model.relationships.map((relation) => relation.id).sort(),
    );
    const boxes = [...layout.positions.values()];
    const overlapping = boxes.filter((box, index) =>
      boxes.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          box.x < other.x + other.width &&
          other.x < box.x + box.width &&
          box.y < other.y + other.height &&
          other.y < box.y + box.height,
      ),
    );
    expect(overlapping).toEqual([]);
    for (const edge of data.edges) expect(layout.routes.get(edge.id)?.points.length).toBeGreaterThan(1);
  });

  it("nests child lists, links accounts to channel lists and shows calculation sources", () => {
    const model = createCrmPreset(company);
    const data = configureGraphData(model, [], [account], false);
    const lineItems = recordInvariant(data.lists.find((list) => list.type.id === id("lineItem")));
    expect(lineItems.parentId).toBe(id("deal"));
    const parent = data.edges.find((edge) => edge.kind === "relationship" && edge.parent);
    expect(parent?.kind === "relationship" && parent.relation.id).toBe(lineItems.type.parentRelationshipId);
    const layout = configureGraphLayout(data, true, true);
    expect(recordInvariant(layout.positions.get(id("lineItem"))).y).toBeGreaterThan(
      recordInvariant(layout.positions.get(id("deal"))).y,
    );
    const accountTargets = data.edges.flatMap((edge) => (edge.kind === "account" ? [edge.target] : []));
    expect(accountTargets.length).toBeGreaterThan(0);
    expect(accountTargets).toContain(id("contact"));
    const deals = recordInvariant(data.lists.find((list) => list.type.id === id("deal")));
    const rollup = recordInvariant(deals.fields.find((field) => field.field.behavior.kind === "rollup"));
    expect(rollup.calculated).toBe(true);
    expect(rollup.sources.some((source) => source.startsWith("Line items"))).toBe(true);
    expect(configureCalculationSources(model, rollup.field).lists).toEqual([id("lineItem")]);
    const carrier = data.edges.find(
      (edge) =>
        edge.kind === "relationship" &&
        [edge.relation.sourceTypeId, edge.relation.targetTypeId].includes(id("lineItem")) &&
        [edge.relation.sourceTypeId, edge.relation.targetTypeId].includes(id("deal")),
    );
    expect(carrier?.kind === "relationship" && carrier.calculatedFields).toContain(rollup.field.label);
    expect(data.edges.some((edge) => edge.kind === "calculation")).toBe(false);
  });

  it("keys calculation sources by id, so a field label that looks like a list name does not hide that list", () => {
    const model = createCrmPreset(company);
    const quantity = recordInvariant(model.fields.find((field) => field.id === id("deal.totalQuantity")));
    quantity.label = "Line items · Count";
    const weighted = recordInvariant(model.fields.find((field) => field.id === id("deal.weightedValue")));
    weighted.behavior = {
      kind: "formula",
      expression: {
        kind: "operation",
        operator: "add",
        arguments: [
          { kind: "field", fieldId: quantity.id },
          {
            kind: "related",
            relationId: id("lineItem.deal"),
            direction: "incoming",
            expression: { kind: "literal", value: { kind: "decimal", value: "1", currency: null } },
            reducer: "count",
          },
        ],
      },
    };
    expect(configureCalculationSources(model, weighted).sources).toEqual(["Line items · Count", "Line items"]);
  });

  it("names cardinality from the source side and prompts for a connection without accounts", () => {
    const model = createCrmPreset(company);
    const relation = recordInvariant(model.relationships[0]);
    expect(configureCardinality({ ...relation, sourceCardinality: "one", targetCardinality: "many" })).toBe(
      "manyToOne",
    );
    expect(configureCardinality({ ...relation, sourceCardinality: "many", targetCardinality: "one" })).toBe(
      "oneToMany",
    );
    expect(configureCardinality({ ...relation, sourceCardinality: "one", targetCardinality: "one" })).toBe("oneToOne");
    expect(configureCardinality({ ...relation, sourceCardinality: "many", targetCardinality: "many" })).toBe(
      "manyToMany",
    );
    const prompt = configureGraphData(model, [], [], true);
    expect(prompt.edges.some((edge) => edge.kind === "account" && edge.source === "accounts")).toBe(true);
    expect(configureGraphLayout(prompt, false, true).positions.has("accounts")).toBe(true);
  });

  it("uses discovered record counts", () => {
    const model = createCrmPreset(company);
    const catalog = model.types.map((type) => ({ id: type.id, recordCount: 7 }));
    const data = configureGraphData(model, catalog, []);
    expect(data.lists.find((list) => list.type.id === id("deal"))).toMatchObject({ recordCount: 7 });
  });
});
