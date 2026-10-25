import { describe, expect, it } from "vitest";

import type { GeneratedSampleList } from "../workspace-setup-samples";

import { spreadsheetRecordId } from "@/features/data-transfer/spreadsheet/spreadsheet-conversion";
import { setupIdempotencyKey } from "@/features/workspace-setup/setup-references";

import { sampleLineItemPlans } from "../workspace-setup-line-items";

const SETUP = "00000000-0000-4000-8000-0000000000bb";
const DEALS = "00000000-0000-4000-8000-000000000001";
const OFFERINGS = "00000000-0000-4000-8000-000000000002";
const OFFERING_NAME = "00000000-0000-4000-8000-000000000003";
const OFFERING_PRICE = "00000000-0000-4000-8000-000000000004";
const DEAL_NAME = "00000000-0000-4000-8000-000000000005";
const offerings = { typeId: OFFERINGS, priceFieldId: OFFERING_PRICE, nameFieldId: OFFERING_NAME };

function sample(list: string, typeId: string, columns: Array<[string, string]>, rows: string[][]): GeneratedSampleList {
  return {
    list,
    typeId,
    table: {
      sheetName: list,
      headers: columns.map(([column]) => column),
      rows: rows.map((cells, index) => ({ rowNumber: index + 2, cells })),
    },
    mapping: {
      typeId,
      locale: "en",
      timeZone: "UTC",
      columns: columns.map(([column, fieldId]) => ({ column, fieldId })),
      relationships: [],
    },
    titles: rows.map((cells) => cells[0]),
  };
}

const recordId = (list: string, row: number) =>
  spreadsheetRecordId(setupIdempotencyKey(SETUP, `sample:${list}`), `record:${row}`);
const deals = sample("deal", DEALS, [["c1", DEAL_NAME]], [["Relaunch"], ["Campaign"], ["Audit"], ["Rejected"]]);
const catalog = sample(
  "product",
  OFFERINGS,
  [
    ["c1", OFFERING_NAME],
    ["c2", OFFERING_PRICE],
  ],
  [
    ["Workshop", "1500"],
    ["Retainer", "not a price"],
    ["Design sprint", "4000"],
  ],
);
const imported = new Set([
  recordId("deal", 2),
  recordId("deal", 3),
  recordId("deal", 4),
  recordId("product", 2),
  recordId("product", 3),
  recordId("product", 4),
]);
describe("sample deal line items", () => {
  it("links imported deals to imported offerings with varied quantities", () => {
    const plans = sampleLineItemPlans({
      setupId: SETUP,
      samples: [catalog, deals],
      imported,
      deals: DEALS,
      offerings,
    });
    expect(plans).toEqual([
      {
        deal: { typeId: DEALS, recordId: recordId("deal", 2) },
        name: "Workshop",
        quantity: 1,
        offering: { typeId: OFFERINGS, recordId: recordId("product", 2) },
      },
      {
        deal: { typeId: DEALS, recordId: recordId("deal", 3) },
        name: "Design sprint",
        quantity: 2,
        offering: { typeId: OFFERINGS, recordId: recordId("product", 4) },
      },
      {
        deal: { typeId: DEALS, recordId: recordId("deal", 4) },
        name: "Workshop",
        quantity: 3,
        offering: { typeId: OFFERINGS, recordId: recordId("product", 2) },
      },
    ]);
    expect(plans.some(({ deal }) => deal.recordId === recordId("deal", 5))).toBe(false);
  });

  it("adds no line items without priced offerings", () => {
    expect(sampleLineItemPlans({ setupId: SETUP, samples: [deals], imported, deals: DEALS, offerings })).toEqual([]);
  });
});
