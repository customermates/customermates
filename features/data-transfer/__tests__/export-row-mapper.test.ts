import type { ExportableRecord } from "../export/export-row-mapper";

import { describe, expect, it } from "vitest";

import { RECORD_ID_COLUMN_KEY, buildExportColumns } from "../workbook-columns";
import { toWorkbookRow } from "../export/export-row-mapper";

const CREATED = new Date("2026-01-02T03:04:05.000Z");

function contact(overrides: Partial<ExportableRecord> = {}): ExportableRecord {
  return {
    id: "60000000-0000-4000-8000-000000000001",
    firstName: "Maria del Carmen",
    lastName: "van der Berg",
    customFieldValues: [],
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

describe("toWorkbookRow for contacts", () => {
  it("writes the underlying name fields, which is what makes a re-import able to create", () => {
    const columns = buildExportColumns(
      [
        { key: "firstName", header: "First Name" },
        { key: "lastName", header: "Last Name" },
      ],
      [],
    );

    const row = toWorkbookRow(contact(), columns);

    expect(row.firstName).toBe("Maria del Carmen");
    expect(row.lastName).toBe("van der Berg");
    expect(row[RECORD_ID_COLUMN_KEY]).toBe("60000000-0000-4000-8000-000000000001");
  });

  it("never silently emits an empty cell for a name the record actually has", () => {
    const columns = buildExportColumns([{ key: "firstName", header: "First Name" }], []);

    expect(toWorkbookRow(contact(), columns).firstName).not.toBeNull();
  });

  it("still composes a display name for the other entity types, which have a real name field", () => {
    const columns = buildExportColumns([{ key: "name", header: "Name" }], []);

    expect(toWorkbookRow({ ...contact(), name: "Acme GmbH" }, columns).name).toBe("Acme GmbH");
  });

  it("falls back to composing when a record carries only the split fields", () => {
    const columns = buildExportColumns([{ key: "name", header: "Name" }], []);

    expect(toWorkbookRow(contact(), columns).name).toBe("Maria del Carmen van der Berg");
  });

  it("emits null for a key nothing knows about rather than guessing", () => {
    const columns = buildExportColumns([{ key: "somethingElse", header: "?" }], []);

    expect(toWorkbookRow(contact(), columns).somethingElse).toBeNull();
  });
});
