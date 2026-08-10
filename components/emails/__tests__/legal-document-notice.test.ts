import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import LegalDocumentNotice from "../legal-document-notice";

import { CONTENT_LOCALES, type ContentLocale } from "@/i18n/locale-registry";

const COPY = {
  de: {
    body: "Ein berechtigter Administrator muss diese Fassung prüfen.",
    deadlineLabel: "Widerspruchs- und Annahmefrist",
    documentName: "Allgemeine Geschäftsbedingungen",
    greeting: "Hallo Ben,",
    liveLabel: "Aktuelles Dokument",
    signoff: "Viele Grüße\nBen",
    title: "Rechtsdokumente aktualisiert",
  },
  en: {
    body: "An authorised administrator must review this release.",
    deadlineLabel: "Objection and acceptance deadline",
    documentName: "Terms and Conditions",
    greeting: "Hi Ben,",
    liveLabel: "Live document",
    signoff: "Best regards,\nBen",
    title: "Legal documents updated",
  },
} satisfies Record<ContentLocale, Record<string, string>>;

describe("LegalDocumentNotice", () => {
  it.each(CONTENT_LOCALES.map((locale) => ({ locale, ...COPY[locale] })))(
    "renders the visible $locale copy and current live-document link",
    (copy) => {
      const html = renderToStaticMarkup(
        createElement(LegalDocumentNotice, {
          body: copy.body,
          deadline: "21 August 2026",
          deadlineLabel: copy.deadlineLabel,
          documents: [
            {
              name: copy.documentName,
              version: "2026-08-07",
              liveUrl: "https://customermates.com/terms",
            },
          ],
          greeting: copy.greeting,
          liveLabel: copy.liveLabel,
          locale: copy.locale,
          objections: [copy.body],
          signoff: copy.signoff,
          subject: copy.title,
          title: copy.title,
        }),
      );

      expect(html).toContain(copy.title);
      expect(html).toContain(copy.deadlineLabel);
      expect(html).toContain(copy.documentName);
      expect(html).toContain("2026-08-07");
      expect(html).toContain("https://customermates.com/terms");
      expect(html).toContain(copy.liveLabel);
      expect(html).not.toContain("github.com/customermates/customermates/blob");
    },
  );
});
