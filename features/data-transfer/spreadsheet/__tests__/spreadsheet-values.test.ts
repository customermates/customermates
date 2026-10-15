import { describe, expect, it } from "vitest";

import {
  defaultDateOrder,
  normalizeEmail,
  normalizePhone,
  normalizeUrl,
  numberToDecimal,
  parseDateText,
  parseDateTimeText,
  parseDecimalText,
  parseSpreadsheetBoolean,
  parseSpreadsheetCurrency,
  splitPersonName,
} from "../spreadsheet-values";

describe("spreadsheet value parsing", () => {
  it("parses German and English decimals into canonical decimal strings", () => {
    expect(parseDecimalText("1.234,56", "de")).toBe("1234.56");
    expect(parseDecimalText("-1.234.567,5", "de")).toBe("-1234567.5");
    expect(parseDecimalText("1234,5", "de")).toBe("1234.5");
    expect(parseDecimalText("1.234", "de")).toBe("1234");
    expect(parseDecimalText("12.5", "de")).toBe("12.5");
    expect(parseDecimalText("1 234,56", "de")).toBe("1234.56");
    expect(parseDecimalText("1,234.56", "en")).toBe("1234.56");
    expect(parseDecimalText("1,234", "en")).toBe("1234");
    expect(parseDecimalText("007", "en")).toBe("7");
    expect(parseDecimalText("-0", "en")).toBe("0");
    expect(parseDecimalText("1.234,56", "en")).toBeNull();
    expect(parseDecimalText("1,23,4", "de")).toBeNull();
    expect(parseDecimalText("12abc", "de")).toBeNull();
    expect(numberToDecimal(1234.5)).toBe("1234.5");
    expect(numberToDecimal(1e21)).toBe("1000000000000000000000");
    expect(numberToDecimal(Number.NaN)).toBeNull();
  });

  it("derives separators and date order from every registered formatting locale", () => {
    expect(parseDecimalText("1 234,56", "fr")).toBe("1234.56");
    expect(parseDecimalText("1.234,56", "es")).toBe("1234.56");
    expect(parseDecimalText("1.234,56", "it")).toBe("1234.56");
    expect(defaultDateOrder("en")).toBe("mdy");
    expect(defaultDateOrder("de")).toBe("dmy");
    expect(parseDateText("31/12/2026", "fr")).toBe("2026-12-31");
  });

  it("reads currency codes and symbols on either side of the amount", () => {
    expect(parseSpreadsheetCurrency("1.234,56 €", "de")).toEqual({ value: "1234.56", currency: "EUR" });
    expect(parseSpreadsheetCurrency("EUR 99,90", "de")).toEqual({ value: "99.90", currency: "EUR" });
    expect(parseSpreadsheetCurrency("$1,200.00", "en")).toEqual({ value: "1200.00", currency: "USD" });
    expect(parseSpreadsheetCurrency("15 CHF", "en")).toEqual({ value: "15", currency: "CHF" });
    expect(parseSpreadsheetCurrency("42", "en")).toEqual({ value: "42", currency: null });
    expect(parseSpreadsheetCurrency(12.5, "de")).toEqual({ value: "12.5", currency: null });
    expect(parseSpreadsheetCurrency("lots", "en")).toBeNull();
  });

  it("parses dates by locale, explicit order and ISO form", () => {
    expect(parseDateText("31.12.2026", "de")).toBe("2026-12-31");
    expect(parseDateText("1.2.26", "de")).toBe("2026-02-01");
    expect(parseDateText("12/31/2026", "en")).toBe("2026-12-31");
    expect(parseDateText("31/12/2026", "en", "dmy")).toBe("2026-12-31");
    expect(parseDateText("2026-12-31", "de")).toBe("2026-12-31");
    expect(parseDateText("2026/12/31", "en")).toBe("2026-12-31");
    expect(parseDateText("31.02.2026", "de")).toBeNull();
    expect(parseDateText("12/31/2026", "de")).toBeNull();
    expect(parseDateText("tomorrow", "en")).toBeNull();
  });

  it("anchors wall-clock date times in the mapping's time zone", () => {
    expect(parseDateTimeText("31.12.2026 14:30", "de", "Europe/Berlin")).toBe("2026-12-31T14:30:00+01:00");
    expect(parseDateTimeText("01.07.2026 08:00:05", "de", "Europe/Berlin")).toBe("2026-07-01T08:00:05+02:00");
    expect(parseDateTimeText("7/1/2026 2:15 PM", "en", "America/New_York")).toBe("2026-07-01T14:15:00-04:00");
    expect(parseDateTimeText("2026-12-31T14:30:00", "de", "UTC")).toBe("2026-12-31T14:30:00+00:00");
    expect(parseDateTimeText("2026-12-31T14:30:00Z", "de", "Europe/Berlin")).toBe("2026-12-31T14:30:00Z");
    expect(parseDateTimeText("31.12.2026", "de", "Europe/Berlin")).toBe("2026-12-31T00:00:00+01:00");
    expect(parseDateTimeText("31.12.2026 25:00", "de", "UTC")).toBeNull();
  });

  it("normalizes booleans, phones, emails and URLs", () => {
    expect(["ja", "Yes", "x", "1", true].map((value) => parseSpreadsheetBoolean(value))).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(["nein", "No", "0", false].map((value) => parseSpreadsheetBoolean(value))).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(parseSpreadsheetBoolean("maybe")).toBeNull();
    expect(normalizePhone("+49 (0)30 1234-567")).toBe("+49301234567");
    expect(normalizePhone("0049 30 1234567")).toBe("+49301234567");
    expect(normalizePhone("030 1234567", "49")).toBe("+49301234567");
    expect(normalizePhone("030 1234567")).toBeNull();
    expect(normalizeEmail(" mailto:Ada@Example.com ")).toBe("Ada@Example.com");
    expect(normalizeEmail("not an email")).toBeNull();
    expect(normalizeUrl("example.com/pricing")).toBe("https://example.com/pricing");
    expect(normalizeUrl("https://example.com")).toBe("https://example.com");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("ftp://example.com")).toBeNull();
  });

  it("splits a full person name into first and last name", () => {
    expect(splitPersonName("Ada Lovelace")).toEqual({ first: "Ada", last: "Lovelace" });
    expect(splitPersonName("  Anna  Maria   Schmidt ")).toEqual({ first: "Anna Maria", last: "Schmidt" });
    expect(splitPersonName("Lovelace, Ada")).toEqual({ first: "Ada", last: "Lovelace" });
    expect(splitPersonName("Ursula von der Leyen")).toEqual({ first: "Ursula", last: "von der Leyen" });
    expect(splitPersonName("Ludwig van Beethoven")).toEqual({ first: "Ludwig", last: "van Beethoven" });
    expect(splitPersonName("Van Morrison")).toEqual({ first: "Van", last: "Morrison" });
    expect(splitPersonName("Jean-Luc Picard")).toEqual({ first: "Jean-Luc", last: "Picard" });
    expect(splitPersonName("Cher")).toEqual({ first: "Cher", last: "" });
    expect(splitPersonName("")).toEqual({ first: "", last: "" });
  });
});
