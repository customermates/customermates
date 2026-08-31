import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { MappingTarget, SourceColumn } from "../import/import-mapping";
import type { PlanRow, RelationIndex, SourceRow } from "../import/import-plan";

import { describe, expect, it } from "vitest";
import { CustomColumnType, EntityType } from "@/generated/prisma";

import { IMPORT_ENTITIES } from "../import/import-entity.registry";
import { autoMatchColumns, mappingFromSchemaSheet, normalizeHeader } from "../import/import-mapping";
import { buildPlan, chunkRows, identifiersBySheetRow } from "../import/import-plan";
import { mapFailureToRows } from "../import/import-issues";

const STATUS_A = "aaaa1111-0000-4000-8000-00000000000a";
const STATUS_B = "bbbb2222-0000-4000-8000-00000000000b";
const WON = "11111111-0000-4000-8000-000000000001";
const ACME = "70000000-0000-4000-8000-000000000001";

const contact = IMPORT_ENTITIES[EntityType.contact];

const status: CustomColumnDto = {
  id: STATUS_A,
  label: "Status",
  entityType: EntityType.contact,
  type: CustomColumnType.singleSelect,
  options: { options: [{ value: WON, label: "Won", color: "success", isDefault: false, index: 0 }] },
};

const duplicateStatus: CustomColumnDto = { ...status, id: STATUS_B };

function sources(headers: string[]): SourceColumn[] {
  return headers.map((header, index) => ({ index, letter: "", header, samples: [] }));
}

function rows(cells: Array<Array<string | null>>): SourceRow[] {
  return cells.map((values, index) => ({ sourceIndex: index, sheetRow: index + 2, cells: values }));
}

const relationIndex: RelationIndex = { organization: new Map([["acme gmbh", [ACME]]]) };

function plan(
  mapping: MappingTarget[],
  headers: string[],
  cells: Array<Array<string | null>>,
  channelRows: Array<Record<string, string>> = [],
) {
  return buildPlan({
    rows: rows(cells),
    sources: sources(headers),
    mapping,
    descriptor: contact,
    customColumns: [status],
    relationIndex,
    identifiersByRow: identifiersBySheetRow(channelRows),
  });
}

describe("buildPlan blank handling", () => {
  it("omits a relation key entirely when the cell is blank, so an update cannot detach every relation", () => {
    const result = plan(
      [{ kind: "recordId" }, { kind: "field", key: "organizationIds" }],
      ["ID", "Organizations"],
      [["60000000-0000-4000-8000-000000000001", ""]],
    );

    expect(result.update).toHaveLength(1);
    expect("organizationIds" in result.update[0].payload).toBe(false);
    expect(result.update[0].payload).toEqual({ id: "60000000-0000-4000-8000-000000000001" });
  });

  it("sets a relation key when the cell has a value", () => {
    const result = plan(
      [{ kind: "recordId" }, { kind: "field", key: "organizationIds" }],
      ["ID", "Organizations"],
      [["60000000-0000-4000-8000-000000000001", "Acme GmbH"]],
    );

    expect(result.update[0].payload.organizationIds).toEqual([ACME]);
  });
});

describe("buildPlan create versus update", () => {
  it("routes a row with a record id to update and a row without one to create", () => {
    const result = plan(
      [{ kind: "recordId" }, { kind: "field", key: "firstName" }],
      ["ID", "First name"],
      [
        ["60000000-0000-4000-8000-000000000001", "Ada"],
        ["", "Grace"],
      ],
    );

    expect(result.update.map((row) => row.sheetRow)).toEqual([2]);
    expect(result.create.map((row) => row.sheetRow)).toEqual([3]);
    expect(result.create[0].payload).toEqual({ firstName: "Grace" });
  });

  it("rejects two rows claiming the same record, which would race inside one transaction", () => {
    const result = plan(
      [{ kind: "recordId" }, { kind: "field", key: "firstName" }],
      ["ID", "First name"],
      [
        ["60000000-0000-4000-8000-000000000001", "Ada"],
        ["60000000-0000-4000-8000-000000000001", "Grace"],
      ],
    );

    expect(result.issues.map((issue) => issue.code)).toEqual(["duplicateRecordId"]);
    expect(result.issues[0].sheetRow).toBe(3);
    expect(result.update).toHaveLength(1);
  });
});

describe("buildPlan custom fields and relations", () => {
  it("resolves a single select label back to its stored option id", () => {
    const result = plan([{ kind: "customField", columnId: STATUS_A }], ["Status"], [["Won"]]);

    expect(result.create[0].payload.customFieldValues).toEqual([{ columnId: STATUS_A, value: WON }]);
  });

  it("reports an option that no longer exists instead of writing it through", () => {
    const result = plan([{ kind: "customField", columnId: STATUS_A }], ["Status"], [["Retired"]]);

    expect(result.issues[0]).toMatchObject({ code: "unknownOption", sheetRow: 2, columnLabel: "Status" });
    expect(result.create).toHaveLength(0);
  });

  it("reports an unresolvable relation name rather than silently dropping it", () => {
    const result = plan([{ kind: "field", key: "organizationIds" }], ["Organizations"], [["Nonexistent Ltd"]]);

    expect(result.issues[0]).toMatchObject({ code: "relationNotFound", sheetRow: 2, columnLetter: "A" });
    expect(result.create).toHaveLength(0);
  });
});

describe("autoMatchColumns", () => {
  it("matches known field synonyms across languages", () => {
    const mapping = autoMatchColumns(sources(["Vorname", "Nachname", "ID"]), contact, []);

    expect(mapping).toEqual([
      { kind: "field", key: "firstName" },
      { kind: "field", key: "lastName" },
      { kind: "recordId" },
    ]);
  });

  it("refuses to guess when two custom columns share a label", () => {
    const mapping = autoMatchColumns(sources(["Status"]), contact, [status, duplicateStatus]);

    expect(mapping).toEqual([{ kind: "ignore" }]);
  });

  it("matches a custom column when its label is unambiguous", () => {
    const mapping = autoMatchColumns(sources(["Status"]), contact, [status]);

    expect(mapping).toEqual([{ kind: "customField", columnId: STATUS_A }]);
  });

  it("never maps two source columns onto the same target", () => {
    const mapping = autoMatchColumns(sources(["First name", "Vorname"]), contact, []);

    expect(mapping[0]).toEqual({ kind: "field", key: "firstName" });
    expect(mapping[1]).toEqual({ kind: "ignore" });
  });
});

describe("mappingFromSchemaSheet", () => {
  it("binds by position, which is what keeps duplicate labels apart", () => {
    const mapping = mappingFromSchemaSheet(
      sources(["ID", "Status", "Status"]),
      [
        {
          position: 1,
          header: "ID",
          key: "__recordId",
          customColumnId: "",
          customColumnType: "",
          optionValues: "",
          optionLabels: "",
        },
        {
          position: 2,
          header: "Status",
          key: STATUS_A,
          customColumnId: STATUS_A,
          customColumnType: "singleSelect",
          optionValues: "",
          optionLabels: "",
        },
        {
          position: 3,
          header: "Status",
          key: STATUS_B,
          customColumnId: STATUS_B,
          customColumnType: "singleSelect",
          optionValues: "",
          optionLabels: "",
        },
      ],
      contact,
      [status, duplicateStatus],
    );

    expect(mapping).toEqual([
      { kind: "recordId" },
      { kind: "customField", columnId: STATUS_A },
      { kind: "customField", columnId: STATUS_B },
    ]);
  });

  it("returns null when there is no schema sheet to bind from", () => {
    expect(mappingFromSchemaSheet(sources(["Name"]), [], contact, [])).toBeNull();
  });

  it("binds the relation columns the export actually writes, so a workbook round-trips", () => {
    const schemaRow = (position: number, header: string, key: string) => ({
      position,
      header,
      key,
      customColumnId: "",
      customColumnType: "",
      optionValues: "",
      optionLabels: "",
    });

    const mapping = mappingFromSchemaSheet(
      sources(["Organizations", "Assigned", "Deals", "Tasks"]),
      [
        schemaRow(1, "Organizations", "organizations"),
        schemaRow(2, "Assigned", "users"),
        schemaRow(3, "Deals", "deals"),
        schemaRow(4, "Tasks", "tasks"),
      ],
      contact,
      [],
    );

    expect(mapping).toEqual([
      { kind: "field", key: "organizationIds" },
      { kind: "field", key: "userIds" },
      { kind: "field", key: "dealIds" },
      { kind: "field", key: "taskIds" },
    ]);
  });

  it("still ignores an export column that no import field corresponds to", () => {
    const mapping = mappingFromSchemaSheet(
      sources(["ID", "Channels"]),
      [
        {
          position: 1,
          header: "ID",
          key: "__recordId",
          customColumnId: "",
          customColumnType: "",
          optionValues: "",
          optionLabels: "",
        },
        {
          position: 2,
          header: "Channels",
          key: "channels",
          customColumnId: "",
          customColumnType: "",
          optionValues: "",
          optionLabels: "",
        },
      ],
      contact,
      [],
    );

    expect(mapping?.[1]).toEqual({ kind: "ignore" });
  });
});

describe("mapFailureToRows", () => {
  it("carries the spreadsheet row from the chunk rather than computing it from an offset", () => {
    const chunk: PlanRow[] = [
      { sourceIndex: 3600, sheetRow: 3705, recordId: null, payload: {} },
      { sourceIndex: 3601, sheetRow: 3706, recordId: null, payload: {} },
    ];

    const issues = mapFailureToRows(
      {
        kind: "validation",
        issues: [
          { code: "custom", path: ["contacts", 1, "identifiers", 0, "value"], message: "Channel already linked" },
        ],
      },
      chunk,
      "contacts",
    );

    expect(issues[0]).toMatchObject({ sheetRow: 3706, fieldPath: "identifiers[0].value" });
  });

  it("keeps an issue that does not belong to a row instead of dropping it", () => {
    const issues = mapFailureToRows(
      { kind: "validation", issues: [{ code: "custom", path: [], message: "Too many rows" }] },
      [],
      "contacts",
    );

    expect(issues[0]).toMatchObject({ sheetRow: null, message: "Too many rows" });
  });
});

describe("chunkRows", () => {
  it("splits at the bulk write ceiling", () => {
    expect(
      chunkRows(
        Array.from({ length: 250 }, (_, i) => i),
        100,
      ).map((chunk) => chunk.length),
    ).toEqual([100, 100, 50]);
  });
});

describe("normalizeHeader", () => {
  it("ignores case, spacing and punctuation so foreign headers still match", () => {
    expect(normalizeHeader("  First_Name ")).toBe("firstname");
    expect(normalizeHeader("E-Mail (work)")).toBe("emailwork");
  });
});

describe("identifiersBySheetRow", () => {
  it("groups every channel onto the spreadsheet row it belongs to", () => {
    const byRow = identifiersBySheetRow([
      { row: "2", provider: "mail", value: "ada@example.com", displayName: "Ada" },
      { row: "2", provider: "linkedin", value: "in/ada", displayName: "" },
      { row: "3", provider: "mail", value: "grace@example.com", displayName: "" },
    ]);

    expect(byRow.get(2)).toEqual([
      { provider: "mail", value: "ada@example.com", displayName: "Ada" },
      { provider: "linkedin", value: "in/ada" },
    ]);
    expect(byRow.get(3)).toHaveLength(1);
  });

  it("skips rows with no value or no usable row pointer", () => {
    const byRow = identifiersBySheetRow([
      { row: "2", provider: "mail", value: "   " },
      { row: "", provider: "mail", value: "orphan@example.com" },
    ]);

    expect(byRow.size).toBe(0);
  });
});

describe("buildPlan channels", () => {
  const channels = [{ row: "2", provider: "mail", value: "ada@example.com" }];

  it("attaches channels to a created contact, so an exported file keeps its email", () => {
    const result = plan(
      [{ kind: "recordId" }, { kind: "field", key: "firstName" }],
      ["ID", "First name"],
      [["", "Ada"]],
      channels,
    );

    expect(result.create[0].payload.identifiers).toEqual([{ provider: "mail", value: "ada@example.com" }]);
  });

  it("leaves an updated contact's channels alone, because re-sending them would conflict", () => {
    const result = plan(
      [{ kind: "recordId" }, { kind: "field", key: "firstName" }],
      ["ID", "First name"],
      [["60000000-0000-4000-8000-000000000001", "Ada"]],
      channels,
    );

    expect("identifiers" in result.update[0].payload).toBe(false);
  });

  it("reports an unrecognised channel type rather than sending it to the write path", () => {
    const result = plan(
      [{ kind: "recordId" }, { kind: "field", key: "firstName" }],
      ["ID", "First name"],
      [["", "Ada"]],
      [{ row: "2", provider: "carrier-pigeon", value: "coop-14" }],
    );

    expect(result.issues.map((issue) => issue.code)).toEqual(["unknownProvider"]);
    expect(result.create).toHaveLength(0);
  });
});

describe("buildPlan identifier merging", () => {
  it("combines a mapped channel column with the Channels sheet, without duplicating a shared value", () => {
    const result = plan(
      [{ kind: "recordId" }, { kind: "identifier", provider: "mail" }],
      ["ID", "Email"],
      [["", "ADA@example.com, second@example.com"]],
      [
        { row: "2", provider: "mail", value: "ada@example.com" },
        { row: "2", provider: "linkedin", value: "ada-lovelace.linkedin.example" },
      ],
    );

    expect(result.create[0].payload.identifiers).toEqual([
      { provider: "mail", value: "ADA@example.com" },
      { provider: "mail", value: "second@example.com" },
      { provider: "linkedin", value: "ada-lovelace.linkedin.example" },
    ]);
  });

  it("keeps a mapped channel column working on its own, with no Channels sheet present", () => {
    const result = plan(
      [{ kind: "recordId" }, { kind: "identifier", provider: "whatsapp" }],
      ["ID", "Phone"],
      [["", "+4915112345678"]],
    );

    expect(result.create[0].payload.identifiers).toEqual([{ provider: "whatsapp", value: "+4915112345678" }]);
  });
});

describe("buildPlan channel value validation", () => {
  it("reports a phone column fed prose, and does not manufacture a number from its digits", () => {
    const result = plan(
      [{ kind: "recordId" }, { kind: "identifier", provider: "whatsapp" }],
      ["ID", "Mobil"],
      [["", "Rechnung 2024-000123"]],
    );

    const issue = result.issues.find((entry) => entry.code === "invalidChannelValue");

    expect(issue?.message).toContain("is not a phone number");
    expect(issue?.columnLabel).toBe("Mobil");
    expect(result.create[0].payload.identifiers).toBeUndefined();
  });

  it("keeps the row importable, dropping only the bad channel", () => {
    const result = plan(
      [
        { kind: "field", key: "firstName" },
        { kind: "identifier", provider: "whatsapp" },
      ],
      ["Vorname", "Mobil"],
      [["Ada", "30.08.2026"]],
    );

    expect(result.create).toHaveLength(1);
    expect(result.create[0].payload.firstName).toBe("Ada");
    expect(result.issues.every((entry) => entry.blocking === false)).toBe(true);
  });

  it("accepts the channel values the export actually writes", () => {
    const result = plan(
      [
        { kind: "recordId" },
        { kind: "identifier", provider: "whatsapp" },
        { kind: "identifier", provider: "linkedin" },
      ],
      ["ID", "Phone", "LinkedIn"],
      [["", "+12025550106", "leon-becker.linkedin.example"]],
    );

    expect(result.issues).toHaveLength(0);
    expect(result.create[0].payload.identifiers).toEqual([
      { provider: "whatsapp", value: "+12025550106" },
      { provider: "linkedin", value: "leon-becker.linkedin.example" },
    ]);
  });
});

describe("buildPlan channels on update rows", () => {
  it("never sends mapped channels on an update, because identifiers replace on write", () => {
    const result = plan(
      [{ kind: "recordId" }, { kind: "identifier", provider: "mail" }],
      ["ID", "E-Mail"],
      [["60000000-0000-4000-8000-000000000001", "ada@example.com"]],
    );

    expect(result.update).toHaveLength(1);
    expect(result.update[0].payload.identifiers).toBeUndefined();
    expect(result.issues.map((issue) => issue.code)).toContain("channelsNotUpdated");
    expect(result.issues.every((issue) => issue.blocking === false)).toBe(true);
  });

  it("still applies mapped channels when the row creates a record", () => {
    const result = plan(
      [{ kind: "recordId" }, { kind: "identifier", provider: "mail" }],
      ["ID", "E-Mail"],
      [["", "ada@example.com"]],
    );

    expect(result.create[0].payload.identifiers).toEqual([{ provider: "mail", value: "ada@example.com" }]);
    expect(result.issues).toHaveLength(0);
  });
});
