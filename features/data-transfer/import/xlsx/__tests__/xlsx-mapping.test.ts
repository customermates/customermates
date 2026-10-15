import { describe, expect, it } from "vitest";

import {
  autoMapXlsxColumns,
  duplicateXlsxTargets,
  normalizeXlsxHeader,
  xlsxTargetOptions,
  XLSX_SKIP_KEY,
} from "../xlsx-mapping";
import { fields, labels, model, PERSON, personFields, personModel, PROJECT, PROJECT_COMPANY } from "./xlsx-fixture";

const options = xlsxTargetOptions(model, PROJECT, labels);

describe("xlsx column auto-mapping", () => {
  it("normalizes case, accents, spacing and punctuation", () => {
    expect(normalizeXlsxHeader("  Ünit-Préis (EUR) ")).toBe("unitpreiseur");
    expect(normalizeXlsxHeader("E_Mail.Adresse")).toBe("emailadresse");
  });

  it("offers writable fields, outgoing relationships, assignment and the record ID, never calculated fields", () => {
    const keys = options.map((option) => option.key);
    expect(keys).toContain(`field:${fields.name.id}`);
    expect(keys).toContain(`relationship:${PROJECT_COMPANY}`);
    expect(keys).toContain("assignedTo");
    expect(keys).toContain("recordId");
    expect(keys).not.toContain(`field:${fields.score.id}`);
  });

  it("matches labels case- and accent-insensitively and tolerates plural headers", () => {
    expect(autoMapXlsxColumns(["NAME", "státus", "Tag", "Start Date", "COMPANIES"], options)).toEqual([
      `field:${fields.name.id}`,
      `field:${fields.status.id}`,
      `field:${fields.tags.id}`,
      `field:${fields.start.id}`,
      `relationship:${PROJECT_COMPANY}`,
    ]);
  });

  it("uses synonyms from the previous importer", () => {
    expect(autoMapXlsxColumns(["Title", "Beschreibung", "Owner", "Customermates ID", "Firmen"], options)).toEqual([
      `field:${fields.name.id}`,
      `field:${fields.notes.id}`,
      "assignedTo",
      "recordId",
      `relationship:${PROJECT_COMPANY}`,
    ]);
  });

  it("prefers an exact label over a synonym and never maps two columns to one target", () => {
    expect(autoMapXlsxColumns(["Title", "Name", "name"], options)).toEqual([
      XLSX_SKIP_KEY,
      `field:${fields.name.id}`,
      XLSX_SKIP_KEY,
    ]);
  });

  it("reads exported headers with a currency suffix and split date ranges", () => {
    expect(autoMapXlsxColumns(["Budget (EUR)", "Period (From)", "Period (Until)", "Record ID"], options)).toEqual([
      `field:${fields.budget.id}`,
      `field:${fields.period.id}:start`,
      `field:${fields.period.id}:end`,
      "recordId",
    ]);
  });

  it("skips unknown and empty headers", () => {
    expect(autoMapXlsxColumns(["Favourite colour", ""], options)).toEqual([XLSX_SKIP_KEY, XLSX_SKIP_KEY]);
  });

  it("reports targets chosen by more than one column", () => {
    expect(duplicateXlsxTargets(["a", XLSX_SKIP_KEY, "a", "b", XLSX_SKIP_KEY])).toEqual(["a"]);
  });
});

describe("xlsx full-name split", () => {
  const split = `nameParts:${personFields.first.id}:${personFields.last.id}`;
  const personOptions = xlsxTargetOptions(personModel, PERSON, labels);

  it("offers first and last name together only when a list keeps them apart", () => {
    expect(personOptions.find((option) => option.key === split)).toEqual({
      key: split,
      label: "First name + Last name",
      target: { kind: "nameParts", firstFieldId: personFields.first.id, lastFieldId: personFields.last.id },
    });
    expect(options.some((option) => option.target.kind === "nameParts")).toBe(false);
  });

  it("maps a full-name column onto both name fields when the name itself is calculated", () => {
    expect(autoMapXlsxColumns(["Full name", "Email"], personOptions)).toEqual([
      split,
      `field:${personFields.email.id}`,
    ]);
    expect(autoMapXlsxColumns(["Name"], personOptions)).toEqual([split]);
    expect(autoMapXlsxColumns(["Vollständiger Name"], personOptions)).toEqual([split]);
  });

  it("prefers a writable name field for a full-name column", () => {
    const writableName = {
      ...personModel,
      fields: personModel.fields.map((field) =>
        field.id === personFields.name.id ? { ...field, behavior: { kind: "input" as const } } : field,
      ),
    };
    expect(autoMapXlsxColumns(["Full name"], xlsxTargetOptions(writableName, PERSON, labels))).toEqual([
      `field:${personFields.name.id}`,
    ]);
  });

  it("never splits into a name field another column already fills", () => {
    expect(autoMapXlsxColumns(["Full name", "First name"], personOptions)).toEqual([
      XLSX_SKIP_KEY,
      `field:${personFields.first.id}`,
    ]);
    expect(
      duplicateXlsxTargets([split, `field:${personFields.first.id}`, XLSX_SKIP_KEY, `field:${personFields.email.id}`]),
    ).toEqual([split, `field:${personFields.first.id}`]);
  });
});
