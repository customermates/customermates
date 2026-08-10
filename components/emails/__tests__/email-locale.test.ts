import { createElement } from "react";

import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";

import { EmailLayout } from "../base/email-layout";
import { DEFAULT_EMAIL_LAYOUT_COPY, getEmailLayoutCopy } from "../base/email-layout-copy";
import LegalDocumentNotice from "../legal-document-notice";
import VerifyEmail from "../verify-email";

import { APP_LOCALES, DEFAULT_LOCALE, type AppLocale } from "@/i18n/locale-registry";

const EXPECTED_LAYOUT_COPY = {
  de: { country: "Deutschland", tagline: "Das agentische Open-Source-CRM" },
  en: { country: "Germany", tagline: "The agentic, open-source CRM" },
  es: { country: "Alemania", tagline: "El CRM agéntico de código abierto" },
  fr: { country: "Allemagne", tagline: "Le CRM agentique open source" },
  it: { country: "Germania", tagline: "Il CRM agentico open source" },
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
      const html = await render(
        createElement(LegalDocumentNotice, {
          body: "body",
          deadline: null,
          deadlineLabel: "deadline",
          documents: [],
          greeting: "greeting",
          liveLabel: "live",
          locale,
          layoutCopy,
          objections: [],
          signoff: "signoff",
          subject: "subject",
          title: "title",
        }),
      );
      expect(langAttribute(html), `LegalDocumentNotice rendered for ${locale}`).toBe(locale);
    }
  });
});
