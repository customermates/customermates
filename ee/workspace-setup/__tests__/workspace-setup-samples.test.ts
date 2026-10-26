import { describe, expect, it } from "vitest";

import { compileSetupRecordModel } from "@/features/workspace-setup/setup-model-compiler";
import { SetupPlanSchema } from "@/features/workspace-setup/setup-plan.schema";
import { createSetupResolver } from "@/features/workspace-setup/setup-references";
import {
  SETUP_ID,
  SETUP_LABELS,
  emptyWorkspaceModel,
  prepareConfiguration,
} from "@/features/workspace-setup/__tests__/setup-harness";
import { agencyPlan } from "@/features/workspace-setup/__tests__/setup-plan-fixtures";

import { generatedSampleList, sampleListSpecs } from "../workspace-setup-samples";

async function agency() {
  const plan = SetupPlanSchema.parse(agencyPlan);
  const compiled = compileSetupRecordModel(plan, {
    setupId: SETUP_ID,
    model: emptyWorkspaceModel(),
    labels: SETUP_LABELS,
  });
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
  const prepared = await prepareConfiguration(compiled.data, emptyWorkspaceModel());
  const resolver = createSetupResolver(plan, { model: prepared.model, references: prepared.preview.references });
  const list = (key: string) => resolver.list(key) ?? "";
  const lineItem = prepared.preview.references.find((entry) => entry.reference === "$list.lineItem")?.id ?? "";
  return { model: prepared.model, resolver, list, lineItem };
}

describe("sample record tables", () => {
  it("orders lists so link targets are written first and offers only importable columns", async () => {
    const { model, resolver, list, lineItem } = await agency();
    const levels = sampleListSpecs(
      [
        { list: "deal", typeId: list("deal"), count: 3, kinds: ["Relaunch"] },
        { list: "organization", typeId: list("organization"), count: 2, kinds: [] },
        { list: "lineItem", typeId: lineItem, count: 2, kinds: [] },
      ],
      model,
    );
    expect(levels.map((level) => level.map((spec) => spec.list))).toEqual([["organization"], ["deal"]]);
    const deal = levels[1][0];
    expect(deal.links.map((link) => link.targetList)).toEqual(["organization"]);
    expect(deal.columns.map((column) => column.fieldId)).not.toContain(resolver.field("deal.value"));
    expect(deal.columns.map((column) => column.fieldId)).toContain(resolver.field("deal.stage"));
  });

  it("leaves the Channels and avatar fields of the people list out of sample columns", async () => {
    const { model, resolver, list } = await agency();
    const anchors = new Set([resolver.field("contact.channels") ?? "", resolver.field("contact.avatar") ?? ""]);
    const [[contact]] = sampleListSpecs(
      [{ list: "contact", typeId: list("contact"), count: 3, kinds: [] }],
      model,
      anchors,
    );
    expect(contact.columns.map((column) => column.label)).toEqual(["Contact", "Job title"]);
  });

  it("keeps only links to records that were generated and maps every column for the importer", async () => {
    const { model, list } = await agency();
    const [[organization], [deal]] = sampleListSpecs(
      [
        { list: "organization", typeId: list("organization"), count: 2, kinds: [] },
        { list: "deal", typeId: list("deal"), count: 2, kinds: [] },
      ],
      model,
    );
    const organizations = generatedSampleList(
      organization,
      [{ [organization.titleColumns[0]]: "Alpha GmbH" }, { [organization.titleColumns[0]]: "Beta AG" }],
      new Map(),
      "EUR",
    );
    expect(organizations.titles).toEqual(["Alpha GmbH", "Beta AG"]);
    const link = deal.links[0].column;
    const deals = generatedSampleList(
      deal,
      [
        { [deal.titleColumns[0]]: "Relaunch", [link]: "Alpha GmbH; Gamma Ltd" },
        { [deal.titleColumns[0]]: "Campaign", [link]: "Unknown" },
        { [deal.titleColumns[0]]: "Overflow" },
      ],
      new Map([["organization", organizations.titles]]),
      "EUR",
    );
    const linkIndex = deals.table.headers.indexOf(link);
    expect(deals.table.rows.map((row) => row.cells[linkIndex])).toEqual(["Alpha GmbH", null]);
    expect(deals.mapping.relationships).toEqual([{ column: link, relationId: deal.links[0].relationId }]);
    expect(deals.mapping.columns.length).toBe(deal.columns.length);
    expect(deals.table.rows[0].rowNumber).toBe(2);
  });

  it("gives records with the same name distinct names, so later lists can link to each of them", async () => {
    const { model, list } = await agency();
    const [[deal]] = sampleListSpecs([{ list: "deal", typeId: list("deal"), count: 4, kinds: [] }], model);
    const title = deal.titleColumns.at(-1) ?? "";
    const deals = generatedSampleList(
      deal,
      [
        { [title]: "Website redesign" },
        { [title]: "Shop build" },
        { [title]: "Website redesign" },
        { [title]: "Website redesign" },
      ],
      new Map(),
      "EUR",
    );
    expect(deals.titles).toEqual(["Website redesign", "Shop build", "Website redesign 2", "Website redesign 3"]);
    expect(new Set(deals.titles).size).toBe(deals.titles.length);
  });

  it("links a target that takes only one source at most once across the sample rows", async () => {
    const { model, resolver, list } = await agency();
    const projectDeal = resolver.relationship("projectDeal");
    const oneProjectPerDeal = {
      ...model,
      relationships: model.relationships.map((relation) =>
        relation.id === projectDeal ? { ...relation, targetCardinality: "one" as const } : relation,
      ),
    };
    const [[project]] = sampleListSpecs(
      [
        { list: "project", typeId: list("project"), count: 3, kinds: [] },
        { list: "deal", typeId: list("deal"), count: 2, kinds: [] },
        { list: "organization", typeId: list("organization"), count: 1, kinds: [] },
      ],
      oneProjectPerDeal,
    ).filter((level) => level.some((spec) => spec.list === "project"));
    const dealLink = project.links.find((link) => link.targetList === "deal");
    const clientLink = project.links.find((link) => link.targetList === "organization");
    expect([dealLink?.unique, clientLink?.unique]).toEqual([true, false]);
    const columns = [dealLink?.column ?? "", clientLink?.column ?? ""];
    const projects = generatedSampleList(
      project,
      [
        { [project.titleColumns[0]]: "Launch", [columns[0]]: "Relaunch", [columns[1]]: "Alpha GmbH" },
        { [project.titleColumns[0]]: "Phase two", [columns[0]]: "Relaunch; Campaign", [columns[1]]: "Alpha GmbH" },
        { [project.titleColumns[0]]: "Phase three", [columns[0]]: "Campaign", [columns[1]]: "Alpha GmbH" },
      ],
      new Map([
        ["deal", ["Relaunch", "Campaign"]],
        ["organization", ["Alpha GmbH"]],
      ]),
      "EUR",
    );
    const indexes = columns.map((column) => projects.table.headers.indexOf(column));
    expect(projects.table.rows.map((row) => indexes.map((index) => row.cells[index]))).toEqual([
      ["Relaunch", "Alpha GmbH"],
      ["Campaign", "Alpha GmbH"],
      [null, "Alpha GmbH"],
    ]);
  });

  it("spreads the calendar dates over the current month and keeps the span to an end date", async () => {
    const { model, resolver, list } = await agency();
    const [[project]] = sampleListSpecs([{ list: "project", typeId: list("project"), count: 4, kinds: [] }], model);
    const column = (ref: string) =>
      project.columns.find((entry) => entry.fieldId === resolver.field(ref))?.column ?? "";
    const [start, due, name] = [column("project.startDate"), column("project.dueDate"), project.titleColumns[0]];
    const rows = ["A", "B", "C", "D"].map((title, index) => ({
      [name]: title,
      [start]: `2027-0${index + 2}-10`,
      [due]: `2027-0${index + 2}-17`,
    }));
    rows[3][start] = "";
    const projects = generatedSampleList(project, rows, new Map(), "EUR", {
      starts: new Set([resolver.field("project.startDate") ?? ""]),
      ends: new Map([[resolver.field("project.startDate") ?? "", resolver.field("project.dueDate") ?? ""]]),
      today: new Date("2026-10-26T12:00:00Z"),
    });
    const cells = (header: string) =>
      projects.table.rows.map((row) => row.cells[projects.table.headers.indexOf(header)]);
    expect(cells(start)).toEqual(["2026-10-04", "2026-10-12", "2026-10-20", null]);
    expect(cells(due)).toEqual(["2026-10-11", "2026-10-19", "2026-10-27", "2027-05-17"]);
  });
});
