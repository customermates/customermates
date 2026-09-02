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

const RICH_NOTES = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Discovery call" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Budget confirmed at " },
        { type: "text", marks: [{ type: "bold" }], text: "50k EUR" },
      ],
    },
    {
      type: "bulletList",
      content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Needs SSO" }] }] }],
    },
  ],
};

describe("toWorkbookRow notes", () => {
  it("serializes an editor document to markdown so it can be read back", () => {
    const columns = buildExportColumns([{ key: "notes", header: "Notes" }], []);
    const row = toWorkbookRow(contact({ notes: RICH_NOTES }), columns);

    expect(row.notes).toContain("## Discovery call");
    expect(row.notes).toContain("**50k EUR**");
    expect(row.notes).toContain("- Needs SSO");
  });

  it("never lets one unreadable note fail the whole export", () => {
    const columns = buildExportColumns([{ key: "notes", header: "Notes" }], []);

    expect(
      toWorkbookRow(contact({ notes: { type: "doc", content: [{ type: "callout" }] } }), columns).notes,
    ).toBeNull();
    expect(toWorkbookRow(contact({ notes: {} }), columns).notes).toBeNull();
    expect(toWorkbookRow(contact({ notes: [] }), columns).notes).toBeNull();
  });

  it("carries a note that is already markdown text straight through", () => {
    const columns = buildExportColumns([{ key: "notes", header: "Notes" }], []);

    expect(toWorkbookRow(contact({ notes: "- a legacy plain note" }), columns).notes).toBe("- a legacy plain note");
  });

  it("emits an empty cell rather than a stray marker when a record has no notes", () => {
    const columns = buildExportColumns([{ key: "notes", header: "Notes" }], []);

    expect(toWorkbookRow(contact(), columns).notes).toBeNull();
    expect(toWorkbookRow(contact({ notes: null }), columns).notes).toBeNull();
    expect(toWorkbookRow(contact({ notes: { type: "doc", content: [] } }), columns).notes).toBeNull();
  });
});

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
