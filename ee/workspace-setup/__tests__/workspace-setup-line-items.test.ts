import { describe, expect, it } from "vitest";

import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
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
const range = (min: number, max: number | null): SetupAnswers => ({
  dealSize: { source: "user", confidence: 1, value: { format: "range", min, max } },
});

describe("sample deal line items", () => {
  it("prices imported deals from imported offerings, sized to the company's deal range", () => {
    const plans = sampleLineItemPlans({
      setupId: SETUP,
      samples: [catalog, deals],
      imported,
      answers: range(3_000, 12_000),
      deals: DEALS,
      offerings,
    });
    expect(plans).toEqual([
      {
        deal: { typeId: DEALS, recordId: recordId("deal", 2) },
        name: "Workshop",
        quantity: 2,
        offering: { typeId: OFFERINGS, recordId: recordId("product", 2) },
        unitPrice: null,
      },
      {
        deal: { typeId: DEALS, recordId: recordId("deal", 3) },
        name: "Design sprint",
        quantity: 2,
        offering: { typeId: OFFERINGS, recordId: recordId("product", 4) },
        unitPrice: null,
      },
      {
        deal: { typeId: DEALS, recordId: recordId("deal", 4) },
        name: "Workshop",
        quantity: 3,
        offering: { typeId: OFFERINGS, recordId: recordId("product", 2) },
        unitPrice: null,
      },
    ]);
  });

  it("varies quantities without a deal size and skips deals that were not imported", () => {
    const plans = sampleLineItemPlans({
      setupId: SETUP,
      samples: [catalog, deals],
      imported,
      answers: {},
      deals: DEALS,
      offerings,
    });
    expect(plans.map(({ quantity }) => quantity)).toEqual([1, 2, 3]);
    expect(plans.some(({ deal }) => deal.recordId === recordId("deal", 5))).toBe(false);
  });

  it("uses a rounded saved price without priced offerings and never copies answer text into names", () => {
    const answers: SetupAnswers = {
      ...range(2_000, null),
      offerings: {
        source: "website",
        confidence: 1,
        value: { format: "orderedList", items: [{ label: "Jahresabo" }] },
      },
    };
    const plans = sampleLineItemPlans({ setupId: SETUP, samples: [deals], imported, answers, deals: DEALS, offerings });
    expect(plans.map(({ name, quantity, unitPrice, offering }) => [name, quantity, unitPrice, offering])).toEqual([
      [null, 1, "2000", null],
      [null, 1, "2000", null],
      [null, 1, "2000", null],
    ]);
    expect(
      sampleLineItemPlans({ setupId: SETUP, samples: [deals], imported, answers: {}, deals: DEALS, offerings }),
    ).toEqual([]);
  });
});
