import { describe, expect, it } from "vitest";

import { APP_LOCALES, LOCALE_REGISTRY } from "@/i18n/locale-registry";

import {
  detectedWikiLanguage,
  dominantWikiLanguage,
  wikiLanguageConflicts,
  wikiLanguageMatches,
  wikiSourceLanguageMatches,
} from "../wiki-language";

const samples = {
  en: "Customers can contact our support team whenever they have questions about their subscription. We explain the available options and provide clear information about the next steps. The customer can request a refund within thirty days after purchasing the annual subscription.",
  de: "Kunden können sich bei Fragen zu ihrem Vertrag an unseren Kundendienst wenden. Wir erklären die verfügbaren Möglichkeiten und informieren über die nächsten Schritte. Eine Rückerstattung kann innerhalb von dreißig Tagen nach dem Kauf des jährlichen Abonnements beantragt werden.",
  fr: "Les clients peuvent contacter notre équipe pour obtenir des informations sur leur abonnement. Nous expliquons les différentes possibilités et les prochaines étapes. Le client peut demander un remboursement dans les trente jours suivant la souscription annuelle.",
  it: "I clienti possono contattare il nostro servizio di assistenza per informazioni sul loro abbonamento. Spieghiamo le opzioni disponibili e i passi successivi. Il cliente può richiedere un rimborso entro trenta giorni dalla sottoscrizione annuale.",
  es: "Los clientes pueden contactar con nuestro equipo de atención para obtener información sobre su suscripción. Explicamos las opciones disponibles y los pasos siguientes. El cliente puede solicitar un reembolso dentro de los treinta días posteriores a la suscripción anual.",
};

describe("Wiki content language", () => {
  it.each(APP_LOCALES)("classifies substantive %s content with the registry mapping", (locale) => {
    expect(detectedWikiLanguage(samples[locale])).toBe(LOCALE_REGISTRY[locale].iso6393);
    expect(wikiLanguageMatches(samples[locale], locale)).toBe(true);
    for (const other of APP_LOCALES.filter((value) => value !== locale))
      expect(wikiLanguageConflicts(samples[locale], other)).toBe(true);
  });

  it("uses a unique leading count of classified pages, rather than bytes or ordering", () => {
    expect(dominantWikiLanguage([samples.de, samples.en.repeat(20), samples.de])).toBe("de");
    expect(dominantWikiLanguage([samples.en.repeat(20), samples.de, samples.de])).toBe("de");
    expect(dominantWikiLanguage([samples.en, samples.en, samples.de, samples.fr])).toBe("en");
    expect(dominantWikiLanguage([samples.en, samples.de])).toBeNull();
    expect(dominantWikiLanguage([samples.en, samples.de, samples.fr])).toBeNull();
  });

  it("abstains on short, absent, and code or link-only evidence", () => {
    for (const value of ["", "Product CRM 123", `\`\`\`js\n${samples.en}\n\`\`\``, "https://example.com/".repeat(40)]) {
      expect(detectedWikiLanguage(value)).toBeNull();
      expect(wikiLanguageMatches(value, "en")).toBe(false);
      expect(wikiLanguageConflicts(value, "en")).toBe(false);
    }
    expect(dominantWikiLanguage([])).toBeNull();
  });

  it("rejects confidently foreign structured FAQ content beside a matching source body", () => {
    expect(
      wikiSourceLanguageMatches({ text: samples.en, qaPairs: [{ question: "Refunds?", answer: samples.de }] }, "en"),
    ).toBe(false);
    expect(
      wikiSourceLanguageMatches({ text: samples.en, qaPairs: [{ question: "Refunds?", answer: samples.en }] }, "en"),
    ).toBe(true);
  });

  it("does not force unsupported languages into a supported language", () => {
    const text =
      "Onze klanten kunnen contact opnemen met de klantenservice wanneer zij vragen hebben over hun abonnement. Wij leggen de beschikbare mogelijkheden uit en geven duidelijke informatie over de volgende stappen. Een klant kan binnen dertig dagen na aankoop van het jaarlijkse abonnement een terugbetaling aanvragen.";
    expect(detectedWikiLanguage(text)).toBe("nld");
    expect(wikiLanguageConflicts(text, "en")).toBe(true);
    expect(dominantWikiLanguage([text, text, samples.en])).toBeNull();
  });
});
