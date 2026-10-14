import { describe, expect, it } from "vitest";

import type { XlsxRecordIndex } from "../xlsx-values";

import {
  excelSerialDate,
  parseXlsxBoolean,
  parseXlsxDate,
  parseXlsxDecimal,
  parseXlsxFieldCell,
  parseXlsxMembersCell,
  parseXlsxRecordId,
  parseXlsxRelationshipCell,
} from "../xlsx-values";
import { COMPANY, fields } from "./xlsx-fixture";

const members = [
  { id: "30000000-0000-4000-8000-000000000001", email: "ada@example.test", name: "Ada Lovelace" },
  { id: "30000000-0000-4000-8000-000000000002", email: "bob@example.test", name: "Bob Stone" },
  { id: "30000000-0000-4000-8000-000000000003", email: "bob2@example.test", name: "Bob Stone" },
];

const acme = { typeId: COMPANY, recordId: "40000000-0000-4000-8000-000000000001" };
const globex = { typeId: COMPANY, recordId: "40000000-0000-4000-8000-000000000002" };
const twin = { typeId: COMPANY, recordId: "40000000-0000-4000-8000-000000000003" };
const index: XlsxRecordIndex = {
  byTitle: new Map([
    ["acmegmbh", [acme]],
    ["globex", [globex, twin]],
  ]),
  byId: new Map([acme, globex, twin].map((ref) => [ref.recordId, ref])),
  complete: true,
};

describe("xlsx value parsing", () => {
  it("reads dates from date cells, Excel serial numbers and common text formats", () => {
    expect(excelSerialDate(45658)?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(parseXlsxFieldCell(new Date(Date.UTC(2026, 9, 12)), fields.start, null)).toEqual({
      ok: true,
      value: { kind: "date", value: "2026-10-12" },
    });
    expect(parseXlsxFieldCell(45658, fields.start, null)).toEqual({
      ok: true,
      value: { kind: "date", value: "2025-01-01" },
    });
    for (const text of ["2026-10-12", "12.10.2026", "10/12/2026", "13/10/2026"]) {
      expect(parseXlsxDate(text)?.date.toISOString().slice(0, 10)).toBe(
        text === "13/10/2026" ? "2026-10-13" : "2026-10-12",
      );
    }
    expect(parseXlsxFieldCell("2026-10-12 09:30 UTC", fields.kickoff, null)).toEqual({
      ok: true,
      value: { kind: "dateTime", value: "2026-10-12T09:30:00.000Z" },
    });
    expect(parseXlsxFieldCell("2026-10-12T09:30:00+02:00", fields.kickoff, null)).toEqual({
      ok: true,
      value: { kind: "dateTime", value: "2026-10-12T07:30:00.000Z" },
    });
    expect(parseXlsxFieldCell("31.02.2026", fields.start, null)).toEqual({
      ok: false,
      code: "invalidDate",
      value: "31.02.2026",
    });
    expect(parseXlsxFieldCell("2026-01-01 / 2026-01-31", fields.period, null)).toEqual({
      ok: true,
      value: { kind: "range", start: "2026-01-01", end: "2026-01-31" },
    });
  });

  it("reads numbers and money with either decimal convention and checks the currency", () => {
    expect(parseXlsxDecimal(1234.5)).toEqual({ value: "1234.5", currency: null });
    expect(parseXlsxDecimal("1,234.50")).toEqual({ value: "1234.5", currency: null });
    expect(parseXlsxDecimal("1.234,50 €")).toEqual({ value: "1234.5", currency: "EUR" });
    expect(parseXlsxDecimal("(12)")).toEqual({ value: "-12", currency: null });
    expect(parseXlsxDecimal("12,5")).toEqual({ value: "12.5", currency: null });
    expect(parseXlsxDecimal("abc")).toBeNull();
    expect(parseXlsxFieldCell("EUR 99.90", fields.budget, null)).toEqual({
      ok: true,
      value: { kind: "decimal", value: "99.9", currency: "EUR" },
    });
    expect(parseXlsxFieldCell("$5", fields.budget, null)).toEqual({ ok: false, code: "currencyMismatch", value: "$5" });
    expect(parseXlsxFieldCell(8, fields.hours, null)).toEqual({
      ok: true,
      value: { kind: "decimal", value: "8", currency: null },
    });
    expect(parseXlsxFieldCell("eight", fields.hours, null)).toMatchObject({ ok: false, code: "invalidNumber" });
  });

  it("reads multiple choice by label regardless of case and accents", () => {
    expect(parseXlsxFieldCell("in bearbeitung", fields.status, null)).toEqual({
      ok: true,
      value: { kind: "select", value: "in-progress" },
    });
    expect(parseXlsxFieldCell("Alpha; beta, ALPHA", fields.tags, null)).toEqual({
      ok: true,
      value: { kind: "selectList", value: ["a", "b"] },
    });
    expect(parseXlsxFieldCell("Gamma", fields.tags, null)).toEqual({
      ok: false,
      code: "unknownOption",
      value: "Gamma",
    });
  });

  it("reads booleans in several languages", () => {
    expect(parseXlsxBoolean(true)).toBe(true);
    expect(parseXlsxBoolean("Ja")).toBe(true);
    expect(parseXlsxBoolean("non")).toBe(false);
    expect(parseXlsxBoolean(0)).toBe(false);
    expect(parseXlsxFieldCell("maybe", fields.active, null)).toMatchObject({ ok: false, code: "invalidBoolean" });
  });

  it("validates emails, web addresses and phone numbers", () => {
    expect(parseXlsxFieldCell("ada@example.test", fields.email, null)).toEqual({
      ok: true,
      value: { kind: "text", value: "ada@example.test" },
    });
    expect(parseXlsxFieldCell("ada at example", fields.email, null)).toMatchObject({ ok: false, code: "invalidEmail" });
    expect(parseXlsxFieldCell("https://example.test", fields.website, null)).toMatchObject({ ok: true });
    expect(parseXlsxFieldCell("example.test", fields.website, null)).toMatchObject({ ok: false, code: "invalidUrl" });
    expect(parseXlsxFieldCell("0049 (170) 123-4567", fields.phone, null)).toEqual({
      ok: true,
      value: { kind: "text", value: "+491701234567" },
    });
  });

  it("imports formatted text as plain paragraphs", () => {
    const parsed = parseXlsxFieldCell("First line\n**not bold**", fields.notes, null);
    expect(parsed.ok && parsed.value?.kind === "richText" && JSON.parse(parsed.value.documentJson)).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First line" }] },
        { type: "paragraph", content: [{ type: "text", text: "**not bold**" }] },
      ],
    });
  });

  it("resolves members by email or name and reports unknown or ambiguous members", () => {
    expect(parseXlsxFieldCell("ADA@example.test", fields.lead, members)).toEqual({
      ok: true,
      value: { kind: "member", value: members[0].id },
    });
    expect(parseXlsxFieldCell("ada lovelace", fields.lead, members)).toMatchObject({ ok: true });
    expect(parseXlsxFieldCell("Bob Stone", fields.lead, members)).toMatchObject({ ok: false, code: "ambiguousMember" });
    expect(parseXlsxFieldCell("Eve", fields.lead, members)).toMatchObject({ ok: false, code: "unknownMember" });
    expect(parseXlsxFieldCell("Eve", fields.lead, null)).toMatchObject({ ok: false, code: "lookupUnavailable" });
    expect(parseXlsxMembersCell("ada@example.test, bob2@example.test", members)).toEqual({
      ok: true,
      value: [members[0].id, members[2].id],
    });
  });

  it("resolves linked records by name or ID and reports missing or ambiguous names", () => {
    expect(parseXlsxRelationshipCell("ACME GmbH", index)).toEqual({ ok: true, value: [acme] });
    expect(parseXlsxRelationshipCell(`acme gmbh; ${globex.recordId}`, index)).toEqual({
      ok: true,
      value: [acme, globex],
    });
    expect(parseXlsxRelationshipCell("Globex", index)).toEqual({ ok: false, code: "ambiguousRecord", value: "Globex" });
    expect(parseXlsxRelationshipCell("Initech", index)).toEqual({ ok: false, code: "unknownRecord", value: "Initech" });
    expect(parseXlsxRelationshipCell("", index)).toEqual({ ok: true, value: [] });
  });

  it("accepts only record IDs in the record ID column", () => {
    expect(parseXlsxRecordId(acme.recordId.toUpperCase())).toEqual({ ok: true, value: acme.recordId });
    expect(parseXlsxRecordId("42")).toEqual({ ok: false, code: "invalidRecordId", value: "42" });
  });

  it("treats empty cells as no value", () => {
    expect(parseXlsxFieldCell(null, fields.name, null)).toEqual({ ok: true, value: null });
    expect(parseXlsxFieldCell("   ", fields.budget, null)).toEqual({ ok: true, value: null });
  });
});
