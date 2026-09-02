import type { MappingTarget, SourceColumn } from "../import/import-mapping";

import { describe, expect, it } from "vitest";

import { attributeIssueColumn } from "../import/import-issues";

const SOURCES: SourceColumn[] = [
  { index: 0, letter: "A", header: "Vorname", samples: [] },
  { index: 1, letter: "B", header: "Nachname", samples: [] },
  { index: 2, letter: "C", header: "E-Mail", samples: [] },
];

const MAPPING: MappingTarget[] = [
  { kind: "field", key: "firstName" },
  { kind: "field", key: "lastName" },
  { kind: "identifier", provider: "mail" },
];

describe("attributeIssueColumn", () => {
  it("names the source column a server-side field failure came from", () => {
    expect(attributeIssueColumn("firstName", MAPPING, SOURCES)).toEqual({
      columnLetter: "A",
      columnLabel: "Vorname",
    });
  });

  it("stays silent rather than guessing when the path points into an array", () => {
    expect(attributeIssueColumn("identifiers[0].value", MAPPING, SOURCES)).toBeNull();
    expect(attributeIssueColumn("customFieldValues[1].value", MAPPING, SOURCES)).toBeNull();
  });

  it("stays silent for a field no column was mapped to", () => {
    expect(attributeIssueColumn("notes", MAPPING, SOURCES)).toBeNull();
  });

  it("stays silent for a plan issue that already carries no field path", () => {
    expect(attributeIssueColumn("", MAPPING, SOURCES)).toBeNull();
  });
});
