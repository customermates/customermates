import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import de from "@/i18n/locales/de.json";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import it_ from "@/i18n/locales/it.json";
import nl from "@/i18n/locales/nl.json";
import pl from "@/i18n/locales/pl.json";
import pt from "@/i18n/locales/pt.json";

const LOCALES = { en, de, fr, it: it_, es, pt, pl, nl } as const;

function translatorFor(locale: keyof typeof LOCALES) {
  const t = createTranslator({ locale, messages: LOCALES[locale] });
  return (key: string, values?: Record<string, string | number>) => t(key as never, values as never);
}

describe("counts next to a list name the user chose", () => {
  it("puts the list name first in Polish, where the noun would need a form per count", () => {
    const t = translatorFor("pl");
    expect(t("RecordModel.listCount", { count: 2, label: "Usługi" })).toBe("Usługi: 2");
    expect(t("RecordModel.listCount", { count: 5, label: "Usługi" })).toBe("Usługi: 5");
    expect(
      t("RecordWidgets.numberContextAverageList", { count: 12, label: "Szanse sprzedaży", average: "5 000" }),
    ).toBe("Szanse sprzedaży: 12 · średnia 5 000");
    expect(t("DataView.kanbanCount", { count: 1, singular: "Kontakt", plural: "Kontakty" })).toBe("1 Kontakt");
    expect(t("DataView.kanbanCount", { count: 2, singular: "Kontakt", plural: "Kontakty" })).toBe("Kontakty: 2");
    expect(t("DataView.kanbanCount", { count: 5, singular: "Kontakt", plural: "Kontakty" })).toBe("Kontakty: 5");
  });

  it("keeps the number first in every other language", () => {
    for (const locale of Object.keys(LOCALES).filter((code) => code !== "pl") as Array<keyof typeof LOCALES>) {
      const t = translatorFor(locale);
      expect(t("RecordModel.listCount", { count: 5, label: "X" }), locale).toBe("5 X");
      expect(t("RecordWidgets.numberContextAverageList", { count: 5, label: "X", average: "9" }), locale).toMatch(
        /^5 X · \S+ 9$/,
      );
    }
  });
});
