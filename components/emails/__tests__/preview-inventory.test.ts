import type { ElementType, ReactElement } from "react";
import type { EmailLayoutSharedProps } from "../base/email-layout";
import type { AppLocale } from "@/i18n/locale-registry";

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

import { render } from "@react-email/render";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import AccountsRemovedNotice from "../accounts-removed-notice";
import CompanyInvite from "../company-invite";
import ContactInquiry from "../contact-inquiry";
import Feedback from "../feedback";
import LegalDocumentNoticeContract from "../legal-document-notice-contract";
import LegalDocumentNoticeInformation from "../legal-document-notice-information";
import NewUserNotification from "../new-user-notification";
import ResetPassword from "../reset-password";
import SubscriptionInactivationNotice from "../subscription-inactivation-notice";
import TrialExpiredOffer from "../trial-expired-offer";
import TrialInactivationNotice from "../trial-inactivation-notice";
import TrialInactivationReminder from "../trial-inactivation-reminder";
import TrialWelcome from "../trial-welcome";
import VerifyEmail from "../verify-email";
import { EmailLayout } from "../base/email-layout";
import { EMAIL_PREVIEW_LOGO_URL } from "../preview-layout-props";

import deMessages from "@/i18n/locales/de.json";
import enMessages from "@/i18n/locales/en.json";
import esMessages from "@/i18n/locales/es.json";
import frMessages from "@/i18n/locales/fr.json";
import itMessages from "@/i18n/locales/it.json";
import { APP_LOCALES, DEFAULT_LOCALE, formattingTagFor } from "@/i18n/locale-registry";
import { LEGAL_DOCUMENT_VERSIONS, type LegalDocument } from "@/constants/legal-documents";
import { walkFiles } from "@/tests/conventions/walk";

const ROOT = process.cwd();
const PREVIEW_BASE_URL = "https://preview.example.test";
const PREVIEW_FIRST_NAME = "Sofia";

type PreviewTemplate = ElementType & {
  PreviewProps?: Record<string, unknown>;
};

type PreviewDefinition = {
  audience: "operator-english" | "recipient-localized";
  expectedText: (locale: AppLocale) => string;
  key: string;
  render: (locale: AppLocale) => ReactElement;
  sendSite: string;
  sourcePath: string;
  template: PreviewTemplate;
  templatePath: string;
};

const CATALOGS = {
  de: deMessages,
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  it: itMessages,
} as const;

const LEGAL_DOCUMENT_DATES = {
  de: "7. August 2026",
  en: "August 7, 2026",
  es: "7 de agosto de 2026",
  fr: "7 août 2026",
  it: "7 agosto 2026",
} satisfies Record<AppLocale, string>;

function catalog(locale: AppLocale): typeof enMessages {
  return CATALOGS[locale] as unknown as typeof enMessages;
}

function previewLayoutProps(locale: AppLocale): EmailLayoutSharedProps {
  return {
    layoutCopy: {
      country:
        new Intl.DisplayNames([formattingTagFor(locale)], {
          type: "region",
        }).of("DE") ?? "DE",
      tagline: catalog(locale).EmailLayout.tagline,
    },
    locale,
    logoUrl: EMAIL_PREVIEW_LOGO_URL,
  };
}

function withFirstName(value: string): string {
  return value.replace("{firstName}", PREVIEW_FIRST_NAME);
}

function withInviter(value: string): string {
  return value.replace("{inviterName}", "Anna Müller");
}

function localizedDate(locale: AppLocale, isoDate: string): string {
  return new Intl.DateTimeFormat(formattingTagFor(locale), {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(isoDate));
}

function legalDocuments(locale: AppLocale, documents: readonly LegalDocument[]) {
  const copy = catalog(locale).LegalDocumentNotice;

  return documents.map((document) => ({
    name: copy.documents[document],
    version: localizedDate(locale, LEGAL_DOCUMENT_VERSIONS[document]),
    liveUrl: `${PREVIEW_BASE_URL}/${document}`,
  }));
}

function localizedInactivation(
  template: PreviewTemplate,
  locale: AppLocale,
  copy: typeof enMessages.TrialInactivationNotice,
): ReactElement {
  return createElement(template, {
    ...previewLayoutProps(locale),
    greeting: withFirstName(copy.greeting),
    body: copy.body,
    cta: copy.cta,
    dismiss: copy.dismiss,
    scheduleFallback: copy.scheduleFallback,
    signoff: copy.signoff,
    subject: copy.subject,
    title: copy.title,
    href: `${PREVIEW_BASE_URL}/contact`,
  });
}

const EMAIL_PREVIEW_CASES = [
  {
    key: "verify-email",
    sendSite: "verify-email",
    audience: "recipient-localized",
    sourcePath: "features/auth/auth.service.ts",
    templatePath: "components/emails/verify-email.tsx",
    template: VerifyEmail,
    expectedText: (locale) => catalog(locale).VerifyEmail.subject,
    render: (locale) => {
      const copy = catalog(locale).VerifyEmail;
      return createElement(VerifyEmail, {
        ...previewLayoutProps(locale),
        url: `${PREVIEW_BASE_URL}/auth/verify-email?token=synthetic-preview-token`,
        ...copy,
      });
    },
  },
  {
    key: "reset-password",
    sendSite: "reset-password",
    audience: "recipient-localized",
    sourcePath: "features/auth/auth.service.ts",
    templatePath: "components/emails/reset-password.tsx",
    template: ResetPassword,
    expectedText: (locale) => catalog(locale).ResetPassword.subject,
    render: (locale) => {
      const copy = catalog(locale).ResetPassword;
      return createElement(ResetPassword, {
        ...previewLayoutProps(locale),
        url: `${PREVIEW_BASE_URL}/auth/reset-password?token=synthetic-preview-token`,
        ...copy,
      });
    },
  },
  {
    key: "new-user-notification",
    sendSite: "new-user-notification",
    audience: "operator-english",
    sourcePath: "features/auth/auth.service.ts",
    templatePath: "components/emails/new-user-notification.tsx",
    template: NewUserNotification,
    expectedText: () => "New user registration",
    render: (locale) =>
      createElement(NewUserNotification, {
        ...previewLayoutProps(locale),
        email: "sofia@example.test",
        name: "Sofia Example",
        provider: "Google",
      }),
  },
  {
    key: "company-invite",
    sendSite: "company-invite",
    audience: "recipient-localized",
    sourcePath: "features/company/invite-users-by-email.interactor.ts",
    templatePath: "components/emails/company-invite.tsx",
    template: CompanyInvite,
    expectedText: (locale) => catalog(locale).CompanyInvite.subject,
    render: (locale) => {
      const copy = catalog(locale).CompanyInvite;
      return createElement(CompanyInvite, {
        ...previewLayoutProps(locale),
        inviteLink: `${PREVIEW_BASE_URL}/invitation/synthetic-preview-token`,
        subject: copy.subject,
        preview: withInviter(copy.preview),
        intro: withInviter(copy.intro),
        cta: copy.cta,
        fallback: copy.fallback,
      });
    },
  },
  {
    key: "contact-inquiry",
    sendSite: "contact-inquiry",
    audience: "operator-english",
    sourcePath: "features/contact/send-contact-inquiry.interactor.ts",
    templatePath: "components/emails/contact-inquiry.tsx",
    template: ContactInquiry,
    expectedText: () => "New contact inquiry",
    render: (locale) =>
      createElement(ContactInquiry, {
        ...previewLayoutProps(locale),
        name: "Sofia Example",
        email: "sofia@example.test",
        company: "Example Studio",
        message: "I would like to learn how Customermates can support our synthetic preview team.",
      }),
  },
  {
    key: "feedback",
    sendSite: "feedback",
    audience: "operator-english",
    sourcePath: "features/feedback/feedback.creator.ts",
    templatePath: "components/emails/feedback.tsx",
    template: Feedback,
    expectedText: () => "General Feedback",
    render: (locale) =>
      createElement(Feedback, {
        ...previewLayoutProps(locale),
        feedback: "The new account recovery flow is clear and easy to follow.",
        userEmail: "sofia@example.test",
        userName: "Sofia Example",
        subject: "General Feedback",
      }),
  },
  {
    key: "trial-welcome",
    sendSite: "trial-welcome",
    audience: "recipient-localized",
    sourcePath: "ee/lifecycle/send-welcome-and-demo.interactor.ts",
    templatePath: "components/emails/trial-welcome.tsx",
    template: TrialWelcome,
    expectedText: (locale) => catalog(locale).TrialWelcome.title,
    render: (locale) => {
      const copy = catalog(locale).TrialWelcome;
      return createElement(TrialWelcome, {
        ...previewLayoutProps(locale),
        ...copy,
        greeting: withFirstName(copy.greeting),
      });
    },
  },
  {
    key: "trial-extension-offer",
    sendSite: "trial-extension-offer",
    audience: "recipient-localized",
    sourcePath: "ee/lifecycle/send-trial-extension-offer.interactor.ts",
    templatePath: "components/emails/trial-expired-offer.tsx",
    template: TrialExpiredOffer,
    expectedText: (locale) => catalog(locale).TrialExpiredOffer.title,
    render: (locale) => {
      const copy = catalog(locale).TrialExpiredOffer;
      return createElement(TrialExpiredOffer, {
        ...previewLayoutProps(locale),
        ...copy,
        greeting: withFirstName(copy.greeting),
        href: `${PREVIEW_BASE_URL}/contact`,
      });
    },
  },
  {
    key: "trial-inactivation-reminder",
    sendSite: "trial-inactivation-reminder",
    audience: "recipient-localized",
    sourcePath: "ee/lifecycle/send-trial-inactivation-reminder.interactor.ts",
    templatePath: "components/emails/trial-inactivation-reminder.tsx",
    template: TrialInactivationReminder,
    expectedText: (locale) => catalog(locale).TrialInactivationReminder.title,
    render: (locale) => {
      const copy = catalog(locale).TrialInactivationReminder;
      return createElement(TrialInactivationReminder, {
        ...previewLayoutProps(locale),
        ...copy,
        greeting: withFirstName(copy.greeting),
        href: `${PREVIEW_BASE_URL}/contact`,
      });
    },
  },
  {
    key: "trial-inactivation-notice",
    sendSite: "trial-inactivation-notice",
    audience: "recipient-localized",
    sourcePath: "ee/lifecycle/deactivate-trial-users-and-send-notice.interactor.ts",
    templatePath: "components/emails/trial-inactivation-notice.tsx",
    template: TrialInactivationNotice,
    expectedText: (locale) => catalog(locale).TrialInactivationNotice.title,
    render: (locale) => localizedInactivation(TrialInactivationNotice, locale, catalog(locale).TrialInactivationNotice),
  },
  {
    key: "subscription-inactivation-notice",
    sendSite: "subscription-inactivation-notice",
    audience: "recipient-localized",
    sourcePath: "ee/lifecycle/deactivate-users-after-subscription-grace-period.interactor.ts",
    templatePath: "components/emails/subscription-inactivation-notice.tsx",
    template: SubscriptionInactivationNotice,
    expectedText: (locale) => catalog(locale).SubscriptionInactivationNotice.title,
    render: (locale) =>
      localizedInactivation(SubscriptionInactivationNotice, locale, catalog(locale).SubscriptionInactivationNotice),
  },
  {
    key: "accounts-removed-notice",
    sendSite: "accounts-removed-notice",
    audience: "recipient-localized",
    sourcePath: "ee/messaging/connect/delete-accounts-for-plan.interactor.ts",
    templatePath: "components/emails/accounts-removed-notice.tsx",
    template: AccountsRemovedNotice,
    expectedText: (locale) => catalog(locale).AccountsRemovedNotice.title,
    render: (locale) => {
      const messages = catalog(locale);
      const copy = messages.AccountsRemovedNotice;
      const accounts = `${messages.Common.providers.linkedin} (Sofia), ${messages.Common.providers.google} (sofia@example.test)`;
      return createElement(AccountsRemovedNotice, {
        ...previewLayoutProps(locale),
        ...copy,
        greeting: withFirstName(copy.greeting),
        body: copy.body.replace("{accounts}", accounts).replace("{plan}", messages.Subscription.planNames.pro),
        href: `${PREVIEW_BASE_URL}/profile/connected-accounts`,
      });
    },
  },
  {
    key: "legal-document-notice-contract",
    sendSite: "legal-document-notice",
    audience: "recipient-localized",
    sourcePath: "ee/lifecycle/send-legal-document-notices.interactor.ts",
    templatePath: "components/emails/legal-document-notice-contract.tsx",
    template: LegalDocumentNoticeContract,
    expectedText: (locale) => catalog(locale).LegalDocumentNotice.contractTitle,
    render: (locale) => {
      const copy = catalog(locale).LegalDocumentNotice;
      const supplierDeadline = localizedDate(locale, "2026-08-20T00:00:00.000Z");
      return createElement(LegalDocumentNoticeContract, {
        ...previewLayoutProps(locale),
        body: copy.contractBody,
        deadline: localizedDate(locale, "2026-08-24T00:00:00.000Z"),
        deadlineLabel: copy.contractDeadlineLabel,
        documents: legalDocuments(locale, ["terms", "dpa", "privacy", "subprocessors"]),
        greeting: withFirstName(copy.greeting),
        objections: [
          copy.contractObjection,
          copy.subprocessorObjectionWithDeadline.replace("{deadline}", supplierDeadline),
        ],
        signoff: copy.signoff,
        subject: copy.contractSubject,
        title: copy.contractTitle,
      });
    },
  },
  {
    key: "legal-document-notice-information",
    sendSite: "legal-document-notice",
    audience: "recipient-localized",
    sourcePath: "ee/lifecycle/send-legal-document-notices.interactor.ts",
    templatePath: "components/emails/legal-document-notice-information.tsx",
    template: LegalDocumentNoticeInformation,
    expectedText: (locale) => catalog(locale).LegalDocumentNotice.informationTitle,
    render: (locale) => {
      const copy = catalog(locale).LegalDocumentNotice;
      return createElement(LegalDocumentNoticeInformation, {
        ...previewLayoutProps(locale),
        body: copy.informationBody,
        deadline: localizedDate(locale, "2026-08-20T00:00:00.000Z"),
        deadlineLabel: copy.subprocessorDeadlineLabel,
        documents: legalDocuments(locale, ["privacy", "subprocessors"]),
        greeting: withFirstName(copy.greeting),
        objections: [copy.subprocessorObjection],
        signoff: copy.signoff,
        subject: copy.informationSubject,
        title: copy.informationTitle,
      });
    },
  },
] as const satisfies readonly PreviewDefinition[];

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

function topLevelTemplates(): string[] {
  return readdirSync(join(ROOT, "components/emails"))
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => `components/emails/${name}`)
    .sort();
}

function discoveredPreviewEntries(): string[] {
  const emailsRoot = join(ROOT, "components/emails");

  return walkFiles(emailsRoot, (path) => {
    const relativePath = relative(emailsRoot, path);
    const directories = relativePath.split(sep).slice(0, -1);
    if (directories.some((directory) => directory.startsWith("_") || directory === "static")) return false;
    if (![".js", ".jsx", ".tsx"].includes(extname(path))) return false;

    const fileContents = readFileSync(path, "utf8");
    return (
      /\bexport\s+default\b/m.test(fileContents) ||
      /\bmodule\.exports\s*=/m.test(fileContents) ||
      /\bexport\s+\{[^}]*\bdefault\b[^}]*\}/m.test(fileContents)
    );
  })
    .map((path) => relative(emailsRoot, path))
    .sort();
}

function localesFor(definition: PreviewDefinition): readonly AppLocale[] {
  return definition.audience === "operator-english" ? [DEFAULT_LOCALE] : APP_LOCALES;
}

describe("transactional email preview inventory", () => {
  it("maps all 13 production send sites onto 14 production templates", () => {
    expect(EMAIL_PREVIEW_CASES).toHaveLength(14);
    expect(new Set(EMAIL_PREVIEW_CASES.map(({ key }) => key)).size).toBe(14);
    expect(new Set(EMAIL_PREVIEW_CASES.map(({ sendSite }) => sendSite)).size).toBe(13);
    expect(new Set(EMAIL_PREVIEW_CASES.map(({ templatePath }) => templatePath)).size).toBe(14);
    expect(EMAIL_PREVIEW_CASES.map(({ templatePath }) => templatePath).sort()).toEqual(topLevelTemplates());
  });

  it("pins every template to an existing send source that imports it", () => {
    for (const definition of EMAIL_PREVIEW_CASES) {
      const source = join(ROOT, definition.sourcePath);
      const template = join(ROOT, definition.templatePath);
      expect(existsSync(source), definition.sourcePath).toBe(true);
      expect(existsSync(template), definition.templatePath).toBe(true);
      expect(
        readFileSync(source, "utf8"),
        `${definition.sourcePath} does not import ${definition.templatePath}`,
      ).toContain(`@/${definition.templatePath.replace(/\.tsx$/, "")}`);
    }
  });

  it("reverse-inventories every production EmailService send call", () => {
    const sendSites = new Map<string, string>();
    for (const definition of EMAIL_PREVIEW_CASES) {
      const existingSource = sendSites.get(definition.sendSite);
      if (existingSource) expect(definition.sourcePath).toBe(existingSource);
      else sendSites.set(definition.sendSite, definition.sourcePath);
    }

    expect([...sendSites.values()].sort()).toEqual(productionEmailSends());
  });

  it("keeps recipient localization and internal English explicit", () => {
    expect(EMAIL_PREVIEW_CASES.filter(({ audience }) => audience === "recipient-localized")).toHaveLength(11);
    expect(EMAIL_PREVIEW_CASES.filter(({ audience }) => audience === "operator-english")).toHaveLength(3);
  });

  it("discovers all 14 top-level production templates", () => {
    expect(discoveredPreviewEntries()).toEqual(
      EMAIL_PREVIEW_CASES.map(({ templatePath }) => templatePath.replace("components/emails/", "")).sort(),
    );
    expect(existsSync(join(ROOT, "components/emails/static/customermates-icon.svg"))).toBe(true);
    expect(readFileSync(join(ROOT, "components/emails/static/customermates-icon.svg"), "utf8")).toBe(
      readFileSync(join(ROOT, "public/images/light/customermates-square.svg"), "utf8"),
    );
  });

  it("renders every production template from its real PreviewProps", async () => {
    for (const definition of EMAIL_PREVIEW_CASES) {
      expect(definition.template.PreviewProps, definition.templatePath).toBeDefined();

      const actual = await render(
        createElement(definition.template as PreviewTemplate, definition.template.PreviewProps ?? {}),
      );

      expect(actual, definition.templatePath).toMatch(/<html[^>]*\blang="en"/i);
      expect(actual).toContain("/static/customermates-icon.svg");
      expect(actual).not.toContain("/images/email/customermates-icon@2x.png");
      expect(actual).not.toMatch(/\{(?:firstName|inviterName|accounts|plan|deadline)\}/);
    }
  }, 15_000);
});

describe("transactional email preview rendering", () => {
  it("renders every behavior and locale from synthetic fixtures", async () => {
    let renderCount = 0;

    for (const definition of EMAIL_PREVIEW_CASES) {
      for (const locale of localesFor(definition)) {
        const fixture = definition.render(locale);
        const html = await render(fixture);
        const plainText = await render(fixture, { plainText: true });
        renderCount += 1;

        expect(html, `${definition.key}/${locale}`).toMatch(new RegExp(`<html[^>]*\\blang="${locale}"`, "i"));
        expect(html).toContain("/static/customermates-icon.svg");
        expect(html).not.toContain("/images/email/customermates-icon@2x.png");
        expect(html).not.toMatch(/\{(?:firstName|inviterName|accounts|plan|deadline)\}/);
        expect(html).not.toContain("jane@example.com");
        expect(plainText.toLocaleLowerCase()).toContain(definition.expectedText(locale).toLocaleLowerCase());

        if (definition.sendSite === "legal-document-notice") {
          expect(plainText).toContain(LEGAL_DOCUMENT_DATES[locale]);
          expect(plainText).not.toContain("2026-08-07");
        }
      }
    }

    expect(renderCount).toBe(58);
  }, 15_000);

  it.each(EMAIL_PREVIEW_CASES.filter(({ audience }) => audience === "operator-english"))(
    "forces the internal $key preview to English",
    async (definition) => {
      const html = await render(definition.render(DEFAULT_LOCALE));
      expect(html).toMatch(/<html[^>]*\blang="en"/i);
      expect(html).toContain("The agentic, open-source CRM");
    },
  );

  it("keeps the legal contract and information emails semantically distinct", async () => {
    const contractDefinition = EMAIL_PREVIEW_CASES.find(({ key }) => key === "legal-document-notice-contract");
    const informationDefinition = EMAIL_PREVIEW_CASES.find(({ key }) => key === "legal-document-notice-information");
    if (!contractDefinition || !informationDefinition) throw new Error("Legal email preview definitions are missing");

    const contract = await render(contractDefinition.render("en"));
    const information = await render(informationDefinition.render("en"));

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
