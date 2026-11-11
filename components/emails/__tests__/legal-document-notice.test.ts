import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import LegalDocumentNoticeContract from "../legal-document-notice-contract";
import LegalDocumentNoticeInformation from "../legal-document-notice-information";
import { getEmailLayoutCopy } from "../base/email-layout-copy";

import { CONTENT_LOCALES, type ContentLocale } from "@/i18n/locale-registry";

const COPY = {
  de: {
    body: "Ein berechtigter Administrator muss diese Fassung prüfen.",
    deadlineLabel: "Widerspruchs- und Annahmefrist",
    documentName: "Allgemeine Geschäftsbedingungen",
    documentVersion: "7. August 2026",
    greeting: "Hallo Ben,",
    signoff: "Viele Grüße\nBen",
    title: "Rechtsdokumente aktualisiert",
  },
  en: {
    body: "An authorised administrator must review this release.",
    deadlineLabel: "Objection and acceptance deadline",
    documentName: "Terms and Conditions",
    documentVersion: "August 7, 2026",
    greeting: "Hi Ben,",
    signoff: "Best regards,\nBen",
    title: "Legal documents updated",
  },
  fr: {
    body: "Un administrateur habilité doit examiner cette version.",
    deadlineLabel: "Date limite d’opposition et d’acceptation",
    documentName: "Conditions générales",
    documentVersion: "7 août 2026",
    greeting: "Bonjour Ben,",
    signoff: "Cordialement,\nBen",
    title: "Documents juridiques mis à jour",
  },
  it: {
    body: "Un amministratore autorizzato deve esaminare questa versione.",
    deadlineLabel: "Termine per opposizione e accettazione",
    documentName: "Termini e condizioni",
    documentVersion: "7 agosto 2026",
    greeting: "Ciao Ben,",
    signoff: "Cordiali saluti,\nBen",
    title: "Documenti legali aggiornati",
  },
  es: {
    body: "Un administrador autorizado debe revisar esta versión.",
    deadlineLabel: "Fecha límite de objeción y aceptación",
    documentName: "Términos y condiciones",
    documentVersion: "7 de agosto de 2026",
    greeting: "Hola Ben:",
    signoff: "Un saludo,\nBen",
    title: "Documentos legales actualizados",
  },
  pt: {
    body: "Um administrador autorizado deve revisar esta versão.",
    deadlineLabel: "Prazo para objeção e aceitação",
    documentName: "Termos e Condições",
    documentVersion: "7 de agosto de 2026",
    greeting: "Olá, Ben,",
    signoff: "Atenciosamente,\nBen",
    title: "Documentos legais atualizados",
  },
  pl: {
    body: "Upoważniony administrator musi zapoznać się z tą wersją.",
    deadlineLabel: "Termin sprzeciwu i akceptacji",
    documentName: "Regulamin",
    documentVersion: "7 sierpnia 2026",
    greeting: "Cześć Ben,",
    signoff: "Pozdrawiam,\nBen",
    title: "Zaktualizowano dokumenty prawne",
  },
  nl: {
    body: "Een bevoegde beheerder moet deze versie beoordelen.",
    deadlineLabel: "Deadline voor bezwaar en acceptatie",
    documentName: "Algemene voorwaarden",
    documentVersion: "7 augustus 2026",
    greeting: "Hoi Ben,",
    signoff: "Met vriendelijke groet,\nBen",
    title: "Juridische documenten bijgewerkt",
  },
} satisfies Record<ContentLocale, Record<string, string>>;

describe.each([
  ["contract", LegalDocumentNoticeContract],
  ["information", LegalDocumentNoticeInformation],
] as const)("LegalDocumentNotice %s", (_, Email) => {
  it.each(CONTENT_LOCALES.map((locale) => ({ locale, ...COPY[locale] })))(
    "renders the visible $locale copy and linked document name",
    async (copy) => {
      const layoutCopy = await getEmailLayoutCopy(copy.locale);
      const html = renderToStaticMarkup(
        createElement(Email, {
          body: copy.body,
          deadline: "21 August 2026",
          deadlineLabel: copy.deadlineLabel,
          documents: [
            {
              name: copy.documentName,
              version: copy.documentVersion,
              liveUrl: "https://customermates.com/terms",
            },
          ],
          greeting: copy.greeting,
          locale: copy.locale,
          layoutCopy,
          objections: [copy.body],
          signoff: copy.signoff,
          subject: copy.title,
          title: copy.title,
        }),
      );

      expect(html).toContain(copy.title);
      expect(html).toContain(copy.deadlineLabel);
      expect(html).toContain(copy.documentName);
      expect(html).toContain(copy.documentVersion);
      expect(html).not.toContain("2026-08-07");
      expect(html).not.toContain("—");
      expect(html).not.toContain("Live document");
      expect(html).toContain("https://customermates.com/terms");
      expect(html).not.toContain("github.com/customermates/customermates/blob");
    },
  );
});
