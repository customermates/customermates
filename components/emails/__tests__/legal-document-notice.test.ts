import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import LegalDocumentNotice from "../legal-document-notice";

describe("LegalDocumentNotice", () => {
  it.each([
    {
      locale: "en",
      body: "An authorised administrator must review this release.",
      deadlineLabel: "Objection and acceptance deadline",
      documentName: "Terms and Conditions",
      liveLabel: "Live document",
      title: "Legal documents updated",
    },
    {
      locale: "de",
      body: "Ein berechtigter Administrator muss diese Fassung prüfen.",
      deadlineLabel: "Widerspruchs- und Annahmefrist",
      documentName: "Allgemeine Geschäftsbedingungen",
      liveLabel: "Aktuelles Dokument",
      title: "Rechtsdokumente aktualisiert",
    },
  ])("renders the visible $locale copy and current live-document link", (copy) => {
    const html = renderToStaticMarkup(
      createElement(LegalDocumentNotice, {
        body: copy.body,
        deadline: "21 August 2026",
        deadlineLabel: copy.deadlineLabel,
        documents: [
          {
            name: copy.documentName,
            version: "2026-08-07",
            liveUrl: `https://customermates.com/${copy.locale}/terms`,
          },
        ],
        greeting: copy.locale === "de" ? "Hallo Ben," : "Hi Ben,",
        liveLabel: copy.liveLabel,
        objections: [copy.body],
        signoff: copy.locale === "de" ? "Viele Grüße\nBen" : "Best regards,\nBen",
        subject: copy.title,
        title: copy.title,
      }),
    );

    expect(html).toContain(copy.title);
    expect(html).toContain(copy.deadlineLabel);
    expect(html).toContain(copy.documentName);
    expect(html).toContain("2026-08-07");
    expect(html).toContain(`https://customermates.com/${copy.locale}/terms`);
    expect(html).toContain(copy.liveLabel);
    expect(html).not.toContain("github.com/customermates/customermates/blob");
  });
});
