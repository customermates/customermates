import { describe, expect, it } from "vitest";

import {
  WIDGET_CURRENCY_WHOLE_FROM,
  WIDGET_NUMBER_COMPACT_FROM,
  formatWidgetNumber,
  inlineListLabel,
  widgetNumberAverage,
} from "../widget-number-format";

type Options = Parameters<typeof formatWidgetNumber>[1] & { locale?: string };

const euro = { currency: "EUR", fractionDigits: 2 };
const plain = { currency: null, fractionDigits: 2 };

function format(value: string | number, { locale = "en-US", ...options }: Options) {
  return formatWidgetNumber(value, options, (input, { currency = null, compact = false, maximumFractionDigits }) =>
    new Intl.NumberFormat(locale, {
      style: currency ? "currency" : "decimal",
      ...(currency ? { currency } : {}),
      notation: compact ? "compact" : "standard",
      maximumFractionDigits,
    }).format(input as unknown as number),
  );
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
