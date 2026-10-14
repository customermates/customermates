import { describe, expect, it } from "vitest";

import { presetId } from "@/features/records/crm-preset";

import { generatedSampleList, sampleListSpecs } from "../workspace-setup-samples";
import { SETUP_COMPANY_ID, workspacePreset } from "@/features/workspace-setup/__tests__/setup-harness";

const id = (key: string) => presetId(SETUP_COMPANY_ID, key);

describe("sample record tables", () => {
  it("orders lists so link targets are written first and offers only importable columns", async () => {
    const model = await workspacePreset();
    const levels = sampleListSpecs(
      [
        { list: "deal", typeId: id("deal"), count: 3, kinds: ["Relaunch"] },
        { list: "organization", typeId: id("organization"), count: 2, kinds: [] },
        { list: "lineItem", typeId: id("lineItem"), count: 2, kinds: [] },
      ],
      model,
    );
    expect(levels.map((level) => level.map((spec) => spec.list))).toEqual([["organization"], ["deal"]]);
    const deal = levels[1][0];
    expect(deal.links.map((link) => link.targetList)).toEqual(["organization"]);
    expect(deal.columns.map((column) => column.fieldId)).not.toContain(id("deal.totalValue"));
    expect(deal.columns.map((column) => column.fieldId)).toContain(id("deal.stage"));
  });

  it("keeps only links to records that were generated and maps every column for the importer", async () => {
    const model = await workspacePreset();
    const [[organization], [deal]] = sampleListSpecs(
      [
        { list: "organization", typeId: id("organization"), count: 2, kinds: [] },
        { list: "deal", typeId: id("deal"), count: 2, kinds: [] },
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
