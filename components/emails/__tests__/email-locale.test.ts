import { createElement } from "react";

import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";

import { EmailLayout } from "../base/email-layout";
import { DEFAULT_EMAIL_LAYOUT_COPY, getEmailLayoutCopy } from "../base/email-layout-copy";
import LegalDocumentNoticeContract from "../legal-document-notice-contract";
import LegalDocumentNoticeInformation from "../legal-document-notice-information";
import VerifyEmail from "../verify-email";

import { APP_LOCALES, DEFAULT_LOCALE, type AppLocale } from "@/i18n/locale-registry";

const EXPECTED_LAYOUT_COPY = {
  de: { country: "Deutschland", tagline: "Das Open-Source-CRM zum Nachfassen" },
  en: { country: "Germany", tagline: "The open-source CRM for client follow-up" },
  es: { country: "Alemania", tagline: "El CRM de código abierto para el seguimiento de clientes" },
  fr: { country: "Allemagne", tagline: "Le CRM open source pour relancer vos clients" },
  it: { country: "Germania", tagline: "Il CRM open source per seguire ogni cliente" },
  nl: { country: "Duitsland", tagline: "De open-source CRM voor het opvolgen van klanten" },
  pl: { country: "Niemcy", tagline: "CRM open source do pilnowania kontaktu z klientami" },
  pt: { country: "Alemanha", tagline: "O CRM de código aberto para o acompanhamento de clientes" },
} satisfies Record<AppLocale, { country: string; tagline: string }>;

const verifyEmailCopy = {
  url: "https://example.test/verify",
  subject: "subject",
  intro: "intro",
  cta: "cta",
  fallback: "fallback",
  securityNotice: "securityNotice",
};

function langAttribute(html: string): string | null {
  return html.match(/<html[^>]*\blang="([^"]*)"/i)?.[1] ?? null;
}

describe("email locale", () => {
  it("declares the recipient locale on every app locale", async () => {
    for (const locale of APP_LOCALES) {
      const layoutCopy = await getEmailLayoutCopy(locale);
      const html = await render(createElement(VerifyEmail, { locale, layoutCopy, ...verifyEmailCopy }));
      expect(langAttribute(html), `VerifyEmail rendered for ${locale}`).toBe(locale);
      expect(layoutCopy).toEqual(EXPECTED_LAYOUT_COPY[locale]);
      expect(html).toContain(EXPECTED_LAYOUT_COPY[locale].tagline);
      expect(html).toContain(EXPECTED_LAYOUT_COPY[locale].country);
      if (locale !== DEFAULT_LOCALE) {
        expect(html).not.toContain(EXPECTED_LAYOUT_COPY.en.tagline);
        expect(html).not.toContain("Mannheim, Germany");
      }
    }
  });

  it("requires operator emails to opt into the default locale explicitly", async () => {
    const html = await render(
      createElement(
        EmailLayout,
        { layoutCopy: DEFAULT_EMAIL_LAYOUT_COPY, locale: DEFAULT_LOCALE, title: "title" },
        "body",
      ),
    );
    expect(langAttribute(html)).toBe(DEFAULT_LOCALE);
    expect(html).toContain(EXPECTED_LAYOUT_COPY.en.tagline);
    expect(html).toContain(EXPECTED_LAYOUT_COPY.en.country);
  });

  it("declares every legal-notice recipient locale", async () => {
    for (const locale of APP_LOCALES) {
      const layoutCopy = await getEmailLayoutCopy(locale);
      for (const Email of [LegalDocumentNoticeContract, LegalDocumentNoticeInformation]) {
        const html = await render(
          createElement(Email, {
            body: "body",
            deadline: null,
            deadlineLabel: "deadline",
            documents: [],
            greeting: "greeting",
            locale,
            layoutCopy,
            objections: [],
            signoff: "signoff",
            subject: "subject",
            title: "title",
          }),
        );
        expect(langAttribute(html), `${Email.name} rendered for ${locale}`).toBe(locale);
      }
    }
  });
});

describe("email look", () => {
  it("keeps every email on white with one ink button and no violet", async () => {
    const layoutCopy = await getEmailLayoutCopy(DEFAULT_LOCALE);
    const html = await render(createElement(VerifyEmail, { locale: DEFAULT_LOCALE, layoutCopy, ...verifyEmailCopy }));

    expect(html).toContain("background-color:#ffffff");
    expect(html).toMatch(/background-color:#0a0a0b[^"]*color:#ffffff/);
    expect(html).toContain("border-radius:6px");
    expect(html).not.toMatch(/#5e4ae3|#7a6ae8|#4e3dbb|#f4f4f5/i);
  });
});
