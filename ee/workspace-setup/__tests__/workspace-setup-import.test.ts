import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { RecordModel } from "@/features/records/record-model.schema";
import type { SpreadsheetMapping, SpreadsheetTable } from "@/features/data-transfer/spreadsheet/spreadsheet.schema";

import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { profileSpreadsheet } from "@/features/data-transfer/spreadsheet/spreadsheet-profile";
import { settleSetupImportMapping, setupLinkTargetImports, usableSetupImportMapping } from "../workspace-setup-import";

const companyId = randomUUID();
const id = (key: string) => presetId(companyId, key);
const CHANNELS = id("capability.identity");

const table: SpreadsheetTable = {
  sheetName: "clients",
  headers: ["Full name", "Email", "Phone", "Company"],
  rows: [
    { rowNumber: 2, cells: ["Mary Ann Collins", "mary.collins@example.net", "+44 20 7946 0005", null] },
    { rowNumber: 3, cells: ["Priya Patel", "priya.patel@example.com", "+44 20 7946 0003", "Northgate Analytics"] },
    { rowNumber: 4, cells: ["Jack Whitmore", "jack.whitmore@example.com", "+44 20 7946 0006", "Northgate Analytics"] },
    { rowNumber: 5, cells: ["Lily Chen", "lily.chen@example.com", "+44 20 7946 0019", "Brightwave Media"] },
  ],
};
const profile = profileSpreadsheet(table, "en");

function contactMapping(
  columns: SpreadsheetMapping["columns"],
  relationships: SpreadsheetMapping["relationships"] = [],
): SpreadsheetMapping {
  return { typeId: id("contact"), locale: "en", timeZone: "UTC", columns, relationships };
}

describe("settleSetupImportMapping", () => {
  const model = createCrmPreset(companyId);

  it("keeps a full name whole unless the column fills both name parts", () => {
    const single = contactMapping([{ column: "Full name", fieldId: id("contact.firstName"), namePart: "first" }]);
    expect(settleSetupImportMapping(single, profile, model).columns).toContainEqual({
      column: "Full name",
      fieldId: id("contact.firstName"),
    });
    const split = contactMapping([
      { column: "Full name", fieldId: id("contact.firstName"), namePart: "first" },
      { column: "Full name", fieldId: id("contact.lastName"), namePart: "last" },
    ]);
    expect(settleSetupImportMapping(split, profile, model).columns.slice(0, 2)).toEqual(split.columns);
  });

  it("imports one column of email addresses into the channels, never another column", () => {
    const phone = contactMapping([
      { column: "Full name", fieldId: id("contact.firstName") },
      { column: "Phone", fieldId: CHANNELS },
    ]);
    expect(settleSetupImportMapping(phone, profile, model).columns).toEqual([
      { column: "Full name", fieldId: id("contact.firstName") },
      { column: "Email", fieldId: CHANNELS },
    ]);
    const email = contactMapping([{ column: "Email", fieldId: CHANNELS }]);
    expect(settleSetupImportMapping(email, profile, model)).toEqual(email);
    const organizations = { ...contactMapping([]), typeId: id("organization") };
    expect(settleSetupImportMapping(organizations, profile, model)).toEqual(organizations);
  });
});

describe("usableSetupImportMapping", () => {
  const model = createCrmPreset(companyId);
  const sheet = { table, profile };
  const organizations = (columns: SpreadsheetMapping["columns"]) => ({
    ...contactMapping(columns),
    typeId: id("organization"),
  });

  it("accepts a mapping that fills every required field and names each record from a filled column", () => {
    expect(
      usableSetupImportMapping(organizations([{ column: "Company", fieldId: id("organization.name") }]), sheet, model),
    ).toBe(true);
    expect(usableSetupImportMapping(contactMapping([{ column: "Email", fieldId: CHANNELS }]), sheet, model)).toBe(true);
  });

  it("refuses a mapping without the name column, with an unknown column or naming records from an empty column", () => {
    expect(usableSetupImportMapping(organizations([]), sheet, model)).toBe(false);
    expect(
      usableSetupImportMapping(organizations([{ column: "Name", fieldId: id("organization.name") }]), sheet, model),
    ).toBe(false);
    const empty: SpreadsheetTable = { ...table, headers: [...table.headers, "Trading name"] };
    expect(
      usableSetupImportMapping(
        organizations([{ column: "Trading name", fieldId: id("organization.name") }]),
        { table: empty, profile: profileSpreadsheet(empty, "en") },
        model,
      ),
    ).toBe(false);
  });
});

describe("setupLinkTargetImports", () => {
  it("creates each record a link column names once, before the rows that link to it", () => {
    const model = createCrmPreset(companyId);
    const mapping = contactMapping(
      [{ column: "Full name", fieldId: id("contact.firstName") }],
      [{ column: "Company", relationId: id("contact.organizations") }],
    );
    const { mapping: settled, targets } = setupLinkTargetImports(table, mapping, model);
    expect(settled).toEqual(mapping);
    expect(targets).toEqual([
      {
        relationId: id("contact.organizations"),
        typeId: id("organization"),
        table: {
          sheetName: "clients",
          headers: ["Company"],
          rows: [
            { rowNumber: 2, cells: ["Northgate Analytics"] },
            { rowNumber: 3, cells: ["Brightwave Media"] },
          ],
        },
        mapping: {
          typeId: id("organization"),
          locale: "en",
          timeZone: "UTC",
          columns: [{ column: "Company", fieldId: id("organization.name") }],
          relationships: [],
        },
      },
    ]);
  });

  it("leaves out a link it cannot satisfy, so the rows still import", () => {
    const model: RecordModel = createCrmPreset(companyId);
    model.fields.push({
      id: randomUUID(),
      typeId: id("organization"),
      label: "Registration number",
      valueType: "text",
      behavior: { kind: "input" },
      required: true,
      archived: false,
      publishedSummary: false,
      options: [],
      position: 10,
    });
    const mapping = contactMapping(
      [{ column: "Full name", fieldId: id("contact.firstName") }],
      [{ column: "Company", relationId: id("contact.organizations") }],
    );
    expect(setupLinkTargetImports(table, mapping, model)).toEqual({
      mapping: { ...mapping, relationships: [] },
      targets: [],
    });
  });
});
