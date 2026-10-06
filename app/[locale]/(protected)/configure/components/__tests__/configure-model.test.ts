import { describe, expect, it } from "vitest";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { recordInvariant } from "@/features/records/record-invariant";
import { ConfigurationChangeSchema } from "@/features/records/configuration.schema";
import {
  configureCounts,
  configureFieldOrder,
  configureFieldSource,
  configurePathLists,
  configureRailRows,
  moveConfigureField,
  reorderFieldOperations,
} from "../configure-model";
import { configureMapLayout, MAP_NODE_HEIGHT, MAP_NODE_WIDTH } from "../configure-map-layout";

const company = "6487f9fb-7b10-439a-b783-9d3da8184b14";
const id = (key: string) => presetId(company, key);

describe("configure rail", () => {
  it("lists every list flat with embedded lists directly under their parent", () => {
    const model = createCrmPreset(company);
    const rows = configureRailRows(model, {});
    expect(rows.map((row) => [row.type.pluralLabel, row.depth])).toEqual([
      ["Contacts", 0],
      ["Organizations", 0],
      ["Deals", 0],
      ["Line items", 1],
      ["Services", 0],
      ["Tasks", 0],
    ]);
  });

  it("hides archived lists unless requested or selected and searches labels case-insensitively", () => {
    const model = createCrmPreset(company);
    recordInvariant(model.types.find((type) => type.id === id("service"))).archived = true;
    expect(configureRailRows(model, {}).some((row) => row.type.id === id("service"))).toBe(false);
    expect(configureRailRows(model, { showArchived: true }).some((row) => row.type.id === id("service"))).toBe(true);
    expect(configureRailRows(model, { selectedId: id("service") }).some((row) => row.type.id === id("service"))).toBe(
      true,
    );
    expect(configureRailRows(model, { query: "line" }).map((row) => [row.type.pluralLabel, row.depth])).toEqual([
      ["Line items", 0],
    ]);
    expect(configureRailRows(model, { query: "DEAL" }).map((row) => row.type.pluralLabel)).toEqual(["Deals"]);
  });
});

describe("configure list details", () => {
  it("counts active fields, relationships and activity connections", () => {
    const model = createCrmPreset(company);
    const counts = configureCounts(model, id("deal"));
    expect(counts.fields).toBe(model.fields.filter((field) => field.typeId === id("deal")).length);
    const deal = model.types.find((type) => type.id === id("deal"));
    expect(counts.relationships).toBe(
      model.relationships.filter((relation) => [relation.sourceTypeId, relation.targetTypeId].includes(id("deal")))
        .length + (deal?.relationshipPaths?.length ?? 0),
    );
    expect(counts.activity).toBe(model.activityPaths.filter((path) => path.typeId === id("deal")).length);
  });

  it("describes calculated fields by their source list", () => {
    const model = createCrmPreset(company);
    const sources = model.fields
      .filter((field) => field.typeId === id("deal"))
      .map((field) => configureFieldSource(model, field));
    expect(sources).toContainEqual({ kind: "rollup", list: "Line items" });
    expect(sources).toContainEqual({ kind: "input" });
  });

  it("names the lists an activity path passes through", () => {
    const model = createCrmPreset(company);
    const path = model.activityPaths.find((path) => path.typeId === id("organization") && path.path.length > 0);
    if (path) expect(configurePathLists(model, id("organization"), path.path).length).toBe(path.path.length);
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

describe("configure map layout", () => {
  it("places every visible list once inside the canvas and draws each relationship", () => {
    const model = createCrmPreset(company);
    const layout = configureMapLayout(model, false);
    expect(layout).toEqual(configureMapLayout(model, false));
    expect(layout.nodes.map((node) => node.type.id).sort()).toEqual(model.types.map((type) => type.id).sort());
    for (const node of layout.nodes) {
      expect(node.x - MAP_NODE_WIDTH / 2).toBeGreaterThanOrEqual(0);
      expect(node.y - MAP_NODE_HEIGHT / 2).toBeGreaterThanOrEqual(0);
      expect(node.x + MAP_NODE_WIDTH / 2).toBeLessThanOrEqual(layout.width);
      expect(node.y + MAP_NODE_HEIGHT / 2).toBeLessThanOrEqual(layout.height);
    }
    expect(layout.edges.map((edge) => edge.relation.id).sort()).toEqual(
      model.relationships.map((relation) => relation.id).sort(),
    );
    const overlapping = layout.nodes.filter((node, index) =>
      layout.nodes.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          Math.abs(other.x - node.x) < MAP_NODE_WIDTH &&
          Math.abs(other.y - node.y) < MAP_NODE_HEIGHT,
      ),
    );
    expect(overlapping).toEqual([]);
  });

  it("draws a self relationship as a loop and omits archived lists unless shown", () => {
    const model = createCrmPreset(company);
    recordInvariant(model.types.find((type) => type.id === id("task"))).archived = true;
    model.relationships.push({
      id: "8b1d3c34-55a1-4f4e-9f77-6ad0a0b8f1aa",
      sourceTypeId: id("contact"),
      targetTypeId: id("contact"),
      sourceLabel: "Referred by",
      targetLabel: "Referrals",
      sourceCardinality: "one",
      targetCardinality: "many",
      onSourceDelete: "unlink",
      onTargetDelete: "unlink",
      archived: false,
    });
    const layout = configureMapLayout(model, false);
    expect(layout.nodes.some((node) => node.type.id === id("task"))).toBe(false);
    expect(layout.edges.find((edge) => edge.relation.sourceLabel === "Referred by")?.path).toContain(" C ");
    expect(configureMapLayout(model, true).nodes.some((node) => node.type.id === id("task"))).toBe(true);
  });
});
