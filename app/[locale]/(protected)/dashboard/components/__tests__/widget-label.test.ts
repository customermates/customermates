import { describe, expect, it } from "vitest";

import deMessages from "@/i18n/locales/de.json";
import enMessages from "@/i18n/locales/en.json";
import esMessages from "@/i18n/locales/es.json";
import frMessages from "@/i18n/locales/fr.json";
import itMessages from "@/i18n/locales/it.json";
import { APP_LOCALES, type AppLocale } from "@/i18n/locale-registry";

import { widgetDataPointLabel } from "../widget-label";

const DIAGRAMS = {
  de: deMessages.Diagrams,
  en: enMessages.Diagrams,
  es: esMessages.Diagrams,
  fr: frMessages.Diagrams,
  it: itMessages.Diagrams,
} satisfies Record<AppLocale, typeof enMessages.Diagrams>;

describe("widgetDataPointLabel", () => {
  it.each(APP_LOCALES)("localizes system labels for %s", (locale) => {
    const translate = (key: string) => DIAGRAMS[locale][key.split(".")[1] as "noGroup" | "total"];

    expect(widgetDataPointLabel({ labelKind: "system", systemLabelKey: "total", value: 1 }, translate)).toBe(
      DIAGRAMS[locale].total,
    );
    expect(widgetDataPointLabel({ labelKind: "system", systemLabelKey: "noGroup", value: 1 }, translate)).toBe(
      DIAGRAMS[locale].noGroup,
    );
  });

  it.each(["Total", "No Group", "no-group"])("preserves the literal user label %s", (label) => {
    expect(widgetDataPointLabel({ labelKind: "literal", label, value: 1 }, () => "translated")).toBe(label);
  });
});
