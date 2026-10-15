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
    expect(contact.columns.map((column) => column.label)).toEqual(["Contact", "Job title", "Email"]);
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
});
