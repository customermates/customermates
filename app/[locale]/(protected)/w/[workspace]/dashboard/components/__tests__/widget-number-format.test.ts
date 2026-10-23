import { describe, expect, it } from "vitest";

import {
  WIDGET_CURRENCY_WHOLE_FROM,
  WIDGET_NUMBER_COMPACT_FROM,
  formatWidgetAmount,
  formatWidgetAxisValue,
  formatWidgetNumber,
  inlineListLabel,
  widgetNumberAverage,
} from "../widget-number-format";

type Options = Parameters<typeof formatWidgetNumber>[1] & { locale?: string };

const euro = { currency: "EUR", fractionDigits: 2 };
const plain = { currency: null, fractionDigits: 2 };

function decimalFor(locale: string): Parameters<typeof formatWidgetNumber>[2] {
  return (input, { currency = null, compact = false, maximumFractionDigits }) =>
    new Intl.NumberFormat(locale, {
      style: currency ? "currency" : "decimal",
      ...(currency ? { currency } : {}),
      notation: compact ? "compact" : "standard",
      maximumFractionDigits,
    }).format(input as unknown as number);
}

function format(value: string | number, { locale = "en-US", ...options }: Options) {
  return formatWidgetNumber(value, options, decimalFor(locale));
}

describe("number widget headline", () => {
  it("keeps values below ten thousand exact with the field's precision, except cents on larger amounts", () => {
    expect(WIDGET_NUMBER_COMPACT_FROM).toBe(10_000);
    expect(format("999.5", euro)).toEqual({ display: "€999.50", exact: "€999.50" });
    expect(format("16.666666", euro)).toEqual({ display: "€16.67", exact: "€16.67" });
    expect(format("999.99", { ...plain, fractionDigits: 2 }).display).toBe("999.99");
    expect(format("8500.4", { ...plain, fractionDigits: 2 }).display).toBe("8,500.4");
    expect(format("3.14159", { ...plain, fractionDigits: 4 }).display).toBe("3.1416");
    expect(format("71346.05", { ...euro, fractionDigits: 0 }).exact).toBe("€71,346");
  });

  it("shows currency amounts from one thousand without cents and keeps the exact value", () => {
    expect(WIDGET_CURRENCY_WHOLE_FROM).toBe(1_000);
    expect(format("8500", euro)).toEqual({ display: "€8,500", exact: "€8,500.00" });
    expect(format("1000", euro)).toEqual({ display: "€1,000", exact: "€1,000.00" });
    expect(format("9999.4", euro)).toEqual({ display: "€9,999", exact: "€9,999.40" });
    expect(format("-2750.5", euro).display).toBe("-€2,751");
    expect(format("8500", { ...euro, locale: "de-DE" }).display).toMatch(/^8\.500\s€$/);
  });

  it("compacts currency and numbers from ten thousand with one decimal where useful and no cents", () => {
    expect(format("10000", euro)).toEqual({ display: "€10K", exact: "€10,000.00" });
    expect(format("58000.40", euro)).toEqual({ display: "€58K", exact: "€58,000.40" });
    expect(format("2495023.17", euro)).toEqual({ display: "€2.5M", exact: "€2,495,023.17" });
    expect(format("-25000", euro).display).toBe("-€25K");
    expect(format("123456", plain)).toEqual({ display: "123.5K", exact: "123,456" });
    expect(format("12345678901234567890.12", euro)).toEqual({
      display: "€12,345,678.9T",
      exact: "€12,345,678,901,234,567,890.12",
    });
  });

  it("formats compact values per locale", () => {
    expect(format("2495023", { ...euro, locale: "de-DE" }).display).toBe("2,5 Mio. €");
    expect(format("58321", { ...euro, locale: "fr-FR" }).display).toMatch(/^58,3\sk\s€$/);
  });

  it("keeps counts plain integers with grouping", () => {
    expect(format("43", { ...plain, integer: true })).toEqual({ display: "43", exact: "43" });
    expect(format("1234567", { ...plain, integer: true })).toEqual({
      display: "1,234,567",
      exact: "1,234,567",
    });
  });
});

describe("chart and ranked table amounts", () => {
  const amount = (
    value: string | number,
    options: { currency: string | null; fractionDigits?: number },
    locale = "en-US",
  ) => formatWidgetAmount(value, options, decimalFor(locale));

  it("drops cents from one thousand and keeps them below", () => {
    expect(amount("40600", euro)).toBe("€40,600");
    expect(amount("1000", euro)).toBe("€1,000");
    expect(amount("-2750.5", euro)).toBe("-€2,751");
    expect(amount("999.5", euro)).toBe("€999.50");
    expect(amount("0", euro)).toBe("€0.00");
    expect(amount("40600", euro, "de-DE")).toMatch(/^40\.600\s€$/);
  });

  it("keeps plain numbers at the field's precision", () => {
    expect(amount("8500.25", plain)).toBe("8,500.25");
    expect(amount("12.5", { currency: null })).toBe("12.5");
  });
});

describe("chart axis values", () => {
  const axis = (value: string | number, currency: string | null, locale = "en-US") =>
    formatWidgetAxisValue(value, currency, decimalFor(locale));

  it("abbreviates thousands where the locale does", () => {
    expect(axis(60000, "EUR")).toBe("€60K");
    expect(axis(1250, "EUR")).toBe("€1.25K");
    expect(axis(450, "EUR")).toBe("€450");
    expect(axis(0, "EUR")).toBe("€0");
    expect(axis(12.5, null)).toBe("12.5");
  });

  it("shows whole grouped amounts where the locale keeps thousands", () => {
    expect(axis(9000, "EUR", "de-DE")).toMatch(/^9\.000\s€$/);
    expect(axis(1234.56, "EUR", "de-DE")).toMatch(/^1\.235\s€$/);
    expect(axis(60000, "EUR", "de-DE")).toMatch(/^60\.000\s€$/);
    expect(axis(2500000, "EUR", "de-DE")).toMatch(/^2,5\sMio\.\s€$/);
  });
});

describe("number widget context line", () => {
  it("averages a sum over its records and skips empty totals", () => {
    expect(widgetNumberAverage("2494000", 43)).toBe(58000);
    expect(widgetNumberAverage("100", 0)).toBeNull();
    expect(widgetNumberAverage("100", null)).toBeNull();
  });

  it("lowercases list labels inside the sentence except for German nouns and acronyms", () => {
    expect(inlineListLabel("Deals", "en")).toBe("deals");
    expect(inlineListLabel("Open Deals", "en")).toBe("open deals");
    expect(inlineListLabel("VIP Contacts", "en")).toBe("VIP contacts");
    expect(inlineListLabel("Organisationen", "de")).toBe("Organisationen");
    expect(inlineListLabel("Tâches", "fr")).toBe("tâches");
    expect(inlineListLabel("Opportunità", "it")).toBe("opportunità");
  });
});
