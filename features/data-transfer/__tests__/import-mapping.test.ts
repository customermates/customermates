import type { MappingTarget, SourceColumn } from "../import/import-mapping";
import type { SchemaSheetRow } from "../workbook-columns";

import { describe, expect, it } from "vitest";

import { EntityType } from "@/generated/prisma";

import { IMPORT_ENTITIES } from "../import/import-entity.registry";
import { autoMatchColumns, mappingFromSchemaSheet } from "../import/import-mapping";

const CONTACTS = IMPORT_ENTITIES[EntityType.contact];

const EXPORTED_COLUMNS: Array<[header: string, key: string]> = [
  ["ID", "__recordId"],
  ["First Name", "firstName"],
  ["Last Name", "lastName"],
  ["Organizations", "organizations"],
  ["Tasks", "tasks"],
  ["Email", "identifier:mail"],
  ["WhatsApp", "identifier:whatsapp"],
  ["Assigned", "users"],
];

function schemaRow(position: number, header: string, key: string, customColumnId = ""): SchemaSheetRow {
  return { position, header, key, customColumnId, customColumnType: "", optionValues: "", optionLabels: "" };
}

function sourcesFrom(headers: string[]): SourceColumn[] {
  return headers.map((header, index) => ({ index, letter: String(index), header, samples: [] }));
}

function mapHeaders(headers: string[], schemaRows: SchemaSheetRow[] = SCHEMA_ROWS): MappingTarget[] {
  const mapping = mappingFromSchemaSheet(sourcesFrom(headers), schemaRows, CONTACTS, []);
  if (mapping === null) throw new Error("expected the schema sheet to produce a mapping");

  return mapping;
}

const SCHEMA_ROWS = EXPORTED_COLUMNS.map(([header, key], index) => schemaRow(index + 1, header, key));

const ALL_HEADERS = EXPORTED_COLUMNS.map(([header]) => header);

describe("mappingFromSchemaSheet", () => {
  it("maps an untouched export exactly", () => {
    const mapping = mapHeaders(ALL_HEADERS);

    expect(mapping).toEqual([
      { kind: "recordId" },
      { kind: "field", key: "firstName" },
      { kind: "field", key: "lastName" },
      { kind: "field", key: "organizationIds" },
      { kind: "field", key: "taskIds" },
      { kind: "identifier", provider: "mail" },
      { kind: "identifier", provider: "whatsapp" },
      { kind: "field", key: "userIds" },
    ]);
  });

  it("realigns after the id column is deleted instead of shifting every field", () => {
    const mapping = mapHeaders(ALL_HEADERS.slice(1));

    expect(mapping).toEqual([
      { kind: "field", key: "firstName" },
      { kind: "field", key: "lastName" },
      { kind: "field", key: "organizationIds" },
      { kind: "field", key: "taskIds" },
      { kind: "identifier", provider: "mail" },
      { kind: "identifier", provider: "whatsapp" },
      { kind: "field", key: "userIds" },
    ]);
  });

  it("realigns after a column is inserted in the middle", () => {
    const headers = [...ALL_HEADERS.slice(0, 3), "Scratch", ...ALL_HEADERS.slice(3)];
    const mapping = mapHeaders(headers);

    expect(mapping[0]).toEqual({ kind: "recordId" });
    expect(mapping[1]).toEqual({ kind: "field", key: "firstName" });
    expect(mapping[2]).toEqual({ kind: "field", key: "lastName" });
    expect(mapping[3]).toEqual({ kind: "ignore" });
    expect(mapping[4]).toEqual({ kind: "field", key: "organizationIds" });
  });

  it("realigns after the columns are reordered", () => {
    const headers = ["Assigned", "Last Name", "First Name", "ID"];
    const mapping = mapHeaders(headers);

    expect(mapping).toEqual([
      { kind: "field", key: "userIds" },
      { kind: "field", key: "lastName" },
      { kind: "field", key: "firstName" },
      { kind: "recordId" },
    ]);
  });

  it("auto-matches a column the schema sheet does not describe", () => {
    const headers = [...ALL_HEADERS, "Notes"];
    const mapping = mapHeaders(headers);

    expect(mapping.at(-1)).toEqual({ kind: "field", key: "notes" });
  });

  it("leaves a renamed column unbound rather than binding it to the wrong field", () => {
    const headers = ALL_HEADERS.map((header) => (header === "Last Name" ? "Surname of contact" : header));
    const mapping = mapHeaders(headers);

    expect(mapping[1]).toEqual({ kind: "field", key: "firstName" });
    expect(mapping[2]).toEqual({ kind: "ignore" });
    expect(mapping[3]).toEqual({ kind: "field", key: "organizationIds" });
  });

  it("ignores a channel key that is not a real messaging provider", () => {
    const rows = [schemaRow(1, "Pigeon", "identifier:pigeon")];
    const mapping = mapHeaders(["Pigeon"], rows);

    expect(mapping).toEqual([{ kind: "ignore" }]);
  });

  it("does not read a channel key for an entity without identifiers", () => {
    const rows = [schemaRow(1, "Email", "identifier:mail")];
    const mapping = mappingFromSchemaSheet(sourcesFrom(["Email"]), rows, IMPORT_ENTITIES[EntityType.deal], []);

    expect(mapping).toEqual([{ kind: "ignore" }]);
  });

  it("returns null when the workbook carries no schema sheet", () => {
    expect(mappingFromSchemaSheet(sourcesFrom(ALL_HEADERS), [], CONTACTS, [])).toBeNull();
  });
});

describe("autoMatchColumns", () => {
  it("still matches headers on their own", () => {
    expect(autoMatchColumns(sourcesFrom(["First Name", "Last Name"]), CONTACTS, [])).toEqual([
      { kind: "field", key: "firstName" },
      { kind: "field", key: "lastName" },
    ]);
  });
});
