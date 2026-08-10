import type { ComponentType } from "react";

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { render } from "@react-email/render";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import deMessages from "@/i18n/locales/de.json";
import enMessages from "@/i18n/locales/en.json";
import esMessages from "@/i18n/locales/es.json";
import frMessages from "@/i18n/locales/fr.json";
import itMessages from "@/i18n/locales/it.json";
import { APP_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";
import { walkFiles } from "@/tests/conventions/walk";

import { EmailLayout } from "../base/email-layout";
import {
  EMAIL_PREVIEW_BEHAVIORS,
  EMAIL_PREVIEW_ENTRIES,
  previewLocalesFor,
  renderEmailPreview,
  type EmailPreviewKey,
  type LegalPreviewVariant,
} from "../preview-registry";
import AccountsRemovedNoticePreview from "../previews/accounts-removed-notice";
import CompanyInvitePreview from "../previews/company-invite";
import ContactInquiryPreview from "../previews/contact-inquiry";
import FeedbackPreview from "../previews/feedback";
import LegalContractPreview from "../previews/legal-document-notice-contract";
import LegalInformationPreview from "../previews/legal-document-notice-information";
import NewUserNotificationPreview from "../previews/new-user-notification";
import ResetPasswordPreview from "../previews/reset-password";
import SubscriptionInactivationNoticePreview from "../previews/subscription-inactivation-notice";
import SupportEscalationPreview from "../previews/support-escalation";
import TrialExtensionOfferPreview from "../previews/trial-extension-offer";
import TrialInactivationNoticePreview from "../previews/trial-inactivation-notice";
import TrialInactivationReminderPreview from "../previews/trial-inactivation-reminder";
import TrialWelcomePreview from "../previews/trial-welcome";
import VerifyEmailPreview from "../previews/verify-email";

import type { AppLocale } from "@/i18n/locale-registry";

const ROOT = process.cwd();
type PreviewComponent = ComponentType<{ locale?: AppLocale }>;

const PREVIEW_COMPONENTS: Record<string, PreviewComponent> = {
  "accounts-removed-notice.tsx": AccountsRemovedNoticePreview,
  "company-invite.tsx": CompanyInvitePreview,
  "contact-inquiry.tsx": ContactInquiryPreview,
  "feedback.tsx": FeedbackPreview,
  "legal-document-notice-contract.tsx": LegalContractPreview,
  "legal-document-notice-information.tsx": LegalInformationPreview,
  "new-user-notification.tsx": NewUserNotificationPreview,
  "reset-password.tsx": ResetPasswordPreview,
  "subscription-inactivation-notice.tsx": SubscriptionInactivationNoticePreview,
  "support-escalation.tsx": SupportEscalationPreview,
  "trial-extension-offer.tsx": TrialExtensionOfferPreview,
  "trial-inactivation-notice.tsx": TrialInactivationNoticePreview,
  "trial-inactivation-reminder.tsx": TrialInactivationReminderPreview,
  "trial-welcome.tsx": TrialWelcomePreview,
  "verify-email.tsx": VerifyEmailPreview,
};

const CATALOGS = {
  de: deMessages,
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  it: itMessages,
} as const;

function productionEmailSends(): string[] {
  return ["app", "core", "ee", "features"]
    .flatMap((directory) =>
      walkFiles(
        join(ROOT, directory),
        (path) => /\.(?:ts|tsx)$/.test(path) && !path.includes("/__tests__/") && !path.includes(".test."),
      ),
    )
    .flatMap((path) =>
      [...readFileSync(path, "utf8").matchAll(/\bemailService\.send\s*\(/g)].map(() => relative(ROOT, path)),
    )
    .sort();
}

function expectedLocalizedTitle(
  key: EmailPreviewKey,
  messages: typeof enMessages,
  variant: LegalPreviewVariant,
): string {
  switch (key) {
    case "verify-email":
      return messages.VerifyEmail.subject;
    case "reset-password":
      return messages.ResetPassword.subject;
    case "company-invite":
      return messages.CompanyInvite.subject;
    case "trial-welcome":
      return messages.TrialWelcome.title;
    case "trial-extension-offer":
      return messages.TrialExpiredOffer.title;
    case "trial-inactivation-reminder":
      return messages.TrialInactivationReminder.title;
    case "trial-inactivation-notice":
      return messages.TrialInactivationNotice.title;
    case "subscription-inactivation-notice":
      return messages.SubscriptionInactivationNotice.title;
    case "accounts-removed-notice":
      return messages.AccountsRemovedNotice.title;
    case "legal-document-notice":
      return variant === "contract"
        ? messages.LegalDocumentNotice.contractTitle
        : messages.LegalDocumentNotice.informationTitle;
    default:
      throw new Error(`${key} is not a recipient-localized email`);
  }
}

function topLevelTemplates(): string[] {
  return readdirSync(join(ROOT, "components/emails"))
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => `components/emails/${name}`)
    .sort();
}

describe("transactional email preview inventory", () => {
  it("maps all 14 production sends onto the 13 production templates", () => {
    expect(EMAIL_PREVIEW_BEHAVIORS).toHaveLength(14);
    expect(new Set(EMAIL_PREVIEW_BEHAVIORS.map(({ key }) => key)).size).toBe(14);
    expect(new Set(EMAIL_PREVIEW_BEHAVIORS.map(({ templatePath }) => templatePath)).size).toBe(13);
    expect([...new Set(EMAIL_PREVIEW_BEHAVIORS.map(({ templatePath }) => templatePath))].sort()).toEqual(
      topLevelTemplates(),
    );
  });

  it("pins every behavior to an existing send source and imported template", () => {
    for (const behavior of EMAIL_PREVIEW_BEHAVIORS) {
      const source = join(ROOT, behavior.sourcePath);
      const template = join(ROOT, behavior.templatePath);
      expect(existsSync(source), behavior.sourcePath).toBe(true);
      expect(existsSync(template), behavior.templatePath).toBe(true);
      expect(readFileSync(source, "utf8"), `${behavior.sourcePath} does not import ${behavior.templatePath}`).toContain(
        `@/${behavior.templatePath.replace(/\.tsx$/, "")}`,
      );
    }
  });

  it("reverse-inventories every production EmailService send call", () => {
    expect(EMAIL_PREVIEW_BEHAVIORS.map(({ sourcePath }) => sourcePath).sort()).toEqual(productionEmailSends());
  });

  it("keeps recipient localization and internal English explicit", () => {
    expect(EMAIL_PREVIEW_BEHAVIORS.filter(({ audience }) => audience === "recipient-localized")).toHaveLength(10);
    expect(EMAIL_PREVIEW_BEHAVIORS.filter(({ audience }) => audience === "operator-english")).toHaveLength(4);

    for (const behavior of EMAIL_PREVIEW_BEHAVIORS) {
      expect(previewLocalesFor(behavior.key)).toEqual(
        behavior.audience === "recipient-localized" ? APP_LOCALES : [DEFAULT_LOCALE],
      );
    }
  });

  it("exposes every behavior and legal variant as a preview-server entry", () => {
    const entries = readdirSync(join(ROOT, "components/emails/previews"))
      .filter((name) => name.endsWith(".tsx"))
      .sort();

    expect(entries).toEqual(EMAIL_PREVIEW_ENTRIES.map(({ fileName }) => fileName).sort());
    expect(Object.keys(PREVIEW_COMPONENTS).sort()).toEqual(entries);
    expect(existsSync(join(ROOT, "components/emails/previews/static/customermates-icon.svg"))).toBe(true);
    expect(readFileSync(join(ROOT, "components/emails/previews/static/customermates-icon.svg"), "utf8")).toBe(
      readFileSync(join(ROOT, "public/images/light/customermates-square.svg"), "utf8"),
    );
  });

  it("wires each discovered preview entry to its declared behavior and variant", async () => {
    for (const entry of EMAIL_PREVIEW_ENTRIES) {
      const component = PREVIEW_COMPONENTS[entry.fileName];
      const actual = await render(createElement(component, { locale: "de" }));
      const expected = await render(
        renderEmailPreview(entry.key, {
          locale: "de",
          variant: "variant" in entry ? entry.variant : undefined,
        }),
      );

      expect(actual, entry.fileName).toBe(expected);
    }
  });
});

describe("transactional email preview rendering", () => {
  it("renders every localized behavior, locale, and variant from synthetic fixtures", async () => {
    let renderCount = 0;

    for (const behavior of EMAIL_PREVIEW_BEHAVIORS) {
      for (const locale of previewLocalesFor(behavior.key)) {
        const variants: readonly LegalPreviewVariant[] =
          behavior.key === "legal-document-notice" ? behavior.variants : ["contract"];

        for (const variant of variants) {
          const preview = renderEmailPreview(behavior.key, { locale, variant });
          const html = await render(preview);
          renderCount += 1;

          expect(html, `${behavior.key}/${locale}/${variant}`).toMatch(
            new RegExp(`<html[^>]*\\blang="${locale}"`, "i"),
          );
          expect(html).toContain("/static/customermates-icon.svg");
          expect(html).not.toContain("/images/email/customermates-icon@2x.png");
          expect(html).not.toMatch(/\{(?:firstName|inviterName|accounts|plan|deadline)\}/);
          expect(html).not.toContain("jane@example.com");
          if (behavior.audience === "recipient-localized") {
            const plainText = await render(preview, { plainText: true });
            const expectedTitle = expectedLocalizedTitle(
              behavior.key,
              CATALOGS[locale] as unknown as typeof enMessages,
              variant,
            );
            expect(plainText.toLocaleLowerCase()).toContain(expectedTitle.toLocaleLowerCase());
          }
        }
      }
    }

    expect(renderCount).toBe(59);
  }, 15_000);

  it.each(EMAIL_PREVIEW_BEHAVIORS.filter(({ audience }) => audience === "operator-english").map(({ key }) => key))(
    "forces the internal %s preview to English",
    async (key) => {
      const html = await render(renderEmailPreview(key, { locale: "de" }));
      expect(html).toMatch(/<html[^>]*\blang="en"/i);
      expect(html).toContain("The agentic, open-source CRM");
    },
  );

  it("keeps the legal contract and information fixtures semantically distinct", async () => {
    const contract = await render(
      renderEmailPreview("legal-document-notice", {
        locale: "en",
        variant: "contract",
      }),
    );
    const information = await render(
      renderEmailPreview("legal-document-notice", {
        locale: "en",
        variant: "information",
      }),
    );

    expect(contract).not.toBe(information);
    expect(contract).toContain(enMessages.LegalDocumentNotice.contractTitle);
    expect(contract).toContain(enMessages.LegalDocumentNotice.contractDeadlineLabel);
    expect(contract).toContain('href="https://preview.example.test/terms"');
    expect(contract).toContain('href="https://preview.example.test/dpa"');
    expect(information).toContain(enMessages.LegalDocumentNotice.informationTitle);
    expect(information).toContain(enMessages.LegalDocumentNotice.subprocessorDeadlineLabel);
    expect(information).not.toContain('href="https://preview.example.test/terms"');
    expect(information).not.toContain('href="https://preview.example.test/dpa"');
  });

  it("keeps production delivery on the absolute public email asset", async () => {
    const html = await render(
      createElement(
        EmailLayout,
        {
          layoutCopy: {
            country: "Germany",
            tagline: "Synthetic production render",
          },
          locale: "en",
          title: "Production asset contract",
        },
        "Body",
      ),
    );

    expect(html).toContain('src="http://localhost:4000/images/email/customermates-icon@2x.png"');
  });
});
