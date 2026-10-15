import { describe, expect, it } from "vitest";

import {
  autoMapXlsxColumns,
  duplicateXlsxTargets,
  normalizeXlsxHeader,
  xlsxTargetOptions,
  XLSX_CHANNELS_KEY,
  XLSX_SKIP_KEY,
} from "../xlsx-mapping";
import { fields, labels, model, PROJECT, PROJECT_COMPANY } from "./xlsx-fixture";

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

  it("maps phone columns to the Channels field, several columns at once", () => {
    expect(options.find((option) => option.key === XLSX_CHANNELS_KEY)).toEqual({
      key: XLSX_CHANNELS_KEY,
      label: "Channels",
      target: { kind: "channels" },
    });
    expect(autoMapXlsxColumns(["Phone", "Mobile", "Telefonnummer", "Mobil", "Channels"], options)).toEqual([
      XLSX_CHANNELS_KEY,
      XLSX_CHANNELS_KEY,
      XLSX_CHANNELS_KEY,
      XLSX_CHANNELS_KEY,
      XLSX_SKIP_KEY,
    ]);
    expect(duplicateXlsxTargets([XLSX_CHANNELS_KEY, XLSX_CHANNELS_KEY])).toEqual([]);
  });

  it("maps phone columns to a text field when the list has no live Channels field", () => {
    const phone = { ...fields.name, id: "20000000-0000-4000-8000-000000009999", label: "Phone", required: false };
    const trashed = model.fields.map((field) =>
      field.valueType === "channels" ? { ...field, archived: true } : field,
    );
    const plain = xlsxTargetOptions({ ...model, fields: [...trashed, phone] }, PROJECT, labels);
    expect(plain.some((option) => option.key === XLSX_CHANNELS_KEY)).toBe(false);
    expect(autoMapXlsxColumns(["Telefon", "Mobile"], plain)).toEqual([`field:${phone.id}`, XLSX_SKIP_KEY]);
  });
});
