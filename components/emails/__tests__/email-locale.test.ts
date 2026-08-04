import { createElement } from "react";

import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";

import { EmailLayout } from "../base/email-layout";
import VerifyEmail from "../verify-email";

import { APP_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";

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
      const html = await render(createElement(VerifyEmail, { locale, ...verifyEmailCopy }));
      expect(langAttribute(html), `VerifyEmail rendered for ${locale}`).toBe(locale);
    }
  });

  it("falls back to the default locale when a sender omits one", async () => {
    const html = await render(createElement(EmailLayout, { title: "title" }, "body"));
    expect(langAttribute(html)).toBe(DEFAULT_LOCALE);
  });
});
