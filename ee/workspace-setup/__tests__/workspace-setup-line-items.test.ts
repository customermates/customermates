import { describe, expect, it } from "vitest";

import type { SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { GeneratedSampleList } from "../workspace-setup-samples";

import { presetId } from "@/features/records/crm-preset";
import { spreadsheetRecordId } from "@/features/data-transfer/spreadsheet/spreadsheet-conversion";
import { setupIdempotencyKey } from "@/features/workspace-setup/setup-references";

import { sampleLineItemPlans } from "../workspace-setup-line-items";

const COMPANY = "00000000-0000-4000-8000-0000000000aa";
const SETUP = "00000000-0000-4000-8000-0000000000bb";
const id = (key: string) => presetId(COMPANY, key);

function sample(list: string, columns: Array<[string, string]>, rows: string[][]): GeneratedSampleList {
  return {
    list,
    typeId: id(list),
    table: {
      sheetName: list,
      headers: columns.map(([column]) => column),
      rows: rows.map((cells, index) => ({ rowNumber: index + 2, cells })),
    },
    mapping: {
      typeId: id(list),
      locale: "en",
      timeZone: "UTC",
      columns: columns.map(([column, field]) => ({ column, fieldId: id(field) })),
      relationships: [],
    },
    titles: rows.map((cells) => cells[0]),
  };
}

const recordId = (list: string, row: number) =>
  spreadsheetRecordId(setupIdempotencyKey(SETUP, `sample:${list}`), `record:${row}`);
const deals = sample("deal", [["c1", "deal.name"]], [["Relaunch"], ["Campaign"], ["Audit"], ["Rejected"]]);
const services = sample(
  "service",
  [
    ["c1", "service.name"],
    ["c2", "service.amount"],
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
  recordId("service", 2),
  recordId("service", 3),
  recordId("service", 4),
]);
const range = (min: number, max: number | null): SetupAnswers => ({
  dealSize: { source: "user", confidence: 1, value: { format: "range", min, max } },
});

describe("sample deal line items", () => {
  it("prices imported deals from imported services, sized to the company's deal range", () => {
    const plans = sampleLineItemPlans({
      companyId: COMPANY,
      setupId: SETUP,
      samples: [services, deals],
      imported,
      answers: range(3_000, 12_000),
    });
    expect(plans).toEqual([
      {
        deal: { typeId: id("deal"), recordId: recordId("deal", 2) },
        name: "Workshop",
        quantity: 2,
        service: { typeId: id("service"), recordId: recordId("service", 2) },
        unitPrice: null,
      },
      {
        deal: { typeId: id("deal"), recordId: recordId("deal", 3) },
        name: "Design sprint",
        quantity: 2,
        service: { typeId: id("service"), recordId: recordId("service", 4) },
        unitPrice: null,
      },
      {
        deal: { typeId: id("deal"), recordId: recordId("deal", 4) },
        name: "Workshop",
        quantity: 3,
        service: { typeId: id("service"), recordId: recordId("service", 2) },
        unitPrice: null,
      },
    ]);
  });

  it("varies quantities without a deal size and skips deals that were not imported", () => {
    const plans = sampleLineItemPlans({
      companyId: COMPANY,
      setupId: SETUP,
      samples: [services, deals],
      imported,
      answers: {},
    });
    expect(plans.map(({ quantity }) => quantity)).toEqual([1, 2, 3]);
    expect(plans.some(({ deal }) => deal.recordId === recordId("deal", 5))).toBe(false);
  });

  it("uses a rounded saved price per deal when there are no sample services, and nothing without a deal size", () => {
    const answers: SetupAnswers = {
      ...range(2_000, null),
      offerings: { source: "user", confidence: 1, value: { format: "orderedList", items: [{ label: "Relaunch" }] } },
    };
    const plans = sampleLineItemPlans({ companyId: COMPANY, setupId: SETUP, samples: [deals], imported, answers });
    expect(plans.map(({ name, quantity, unitPrice, service }) => [name, quantity, unitPrice, service])).toEqual([
      ["Relaunch", 1, "2000", null],
      ["Relaunch", 1, "2000", null],
      ["Relaunch", 1, "2000", null],
    ]);
    expect(
      sampleLineItemPlans({ companyId: COMPANY, setupId: SETUP, samples: [deals], imported, answers: {} }),
    ).toEqual([]);
  });
});
