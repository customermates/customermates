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
      revisionLabel: "Version-specific source",
      title: "Legal documents updated",
    },
    {
      locale: "de",
      body: "Ein berechtigter Administrator muss diese Fassung prüfen.",
      deadlineLabel: "Widerspruchs- und Annahmefrist",
      documentName: "Allgemeine Geschäftsbedingungen",
      liveLabel: "Aktuelles Dokument",
      revisionLabel: "Versionsbezogene Quelle",
      title: "Rechtsdokumente aktualisiert",
    },
  ])("renders the visible $locale copy and immutable document links", (copy) => {
    const commit = "a".repeat(40);
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
            revisionUrl: `https://github.com/customermates/customermates/blob/${commit}/content/legal/${copy.locale}/terms.mdx`,
          },
        ],
        greeting: copy.locale === "de" ? "Hallo Ben," : "Hi Ben,",
        liveLabel: copy.liveLabel,
        objections: [copy.body],
        revisionLabel: copy.revisionLabel,
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
    expect(html).toContain(
      `https://github.com/customermates/customermates/blob/${commit}/content/legal/${copy.locale}/terms.mdx`,
    );
    expect(html).toContain(copy.liveLabel);
    expect(html).toContain(copy.revisionLabel);
  });
});
