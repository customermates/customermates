import type { ElementType, ReactElement } from "react";
import type { EmailLayoutSharedProps } from "./base/email-layout";
import type { AppLocale } from "@/i18n/locale-registry";

import { createElement } from "react";

import AccountsRemovedNotice from "./accounts-removed-notice";
import CompanyInvite from "./company-invite";
import ContactInquiry from "./contact-inquiry";
import Feedback from "./feedback";
import LegalDocumentNotice from "./legal-document-notice";
import NewUserNotification from "./new-user-notification";
import ResetPassword from "./reset-password";
import SupportEscalation from "./support-escalation";
import TrialExpiredOffer from "./trial-expired-offer";
import TrialInactivationNotice from "./trial-inactivation-notice";
import TrialInactivationReminder from "./trial-inactivation-reminder";
import TrialWelcome from "./trial-welcome";
import VerifyEmail from "./verify-email";

import deMessages from "@/i18n/locales/de.json";
import enMessages from "@/i18n/locales/en.json";
import esMessages from "@/i18n/locales/es.json";
import frMessages from "@/i18n/locales/fr.json";
import itMessages from "@/i18n/locales/it.json";
import { APP_LOCALES, DEFAULT_LOCALE, formattingTagFor, isAppLocale } from "@/i18n/locale-registry";
import { LEGAL_DOCUMENT_VERSIONS, type LegalDocument } from "@/constants/legal-documents";
import { EMAIL_PREVIEW_LOGO_URL } from "./preview-layout-props";

export type EmailPreviewVariant = "default" | "contract" | "information";

export type EmailPreviewSpec = {
  entryPath?: string;
  variant: EmailPreviewVariant;
};

export type EmailPreviewDefinition = {
  audience: "operator-english" | "recipient-localized";
  expectedText: (locale: AppLocale, variant: EmailPreviewVariant) => string;
  key: string;
  previews: readonly EmailPreviewSpec[];
  render: (locale: AppLocale, variant: EmailPreviewVariant) => ReactElement;
  sourcePath: string;
  template: ElementType & { PreviewProps?: Record<string, unknown> };
  templatePath: string;
};

const CATALOGS = {
  de: deMessages,
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  it: itMessages,
} as const;

const PREVIEW_BASE_URL = "https://preview.example.test";
const PREVIEW_FIRST_NAME = "Sofia";

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

function localizedInactivation(locale: AppLocale, copy: typeof enMessages.TrialInactivationNotice): ReactElement {
  return createElement(TrialInactivationNotice, {
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

export const EMAIL_PREVIEW_MANIFEST = [
  {
    key: "verify-email",
    audience: "recipient-localized",
    sourcePath: "features/auth/auth.service.ts",
    templatePath: "components/emails/verify-email.tsx",
    template: VerifyEmail,
    previews: [{ variant: "default" }],
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
    audience: "recipient-localized",
    sourcePath: "features/auth/auth.service.ts",
    templatePath: "components/emails/reset-password.tsx",
    template: ResetPassword,
    previews: [{ variant: "default" }],
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
    audience: "operator-english",
    sourcePath: "features/auth/auth.service.ts",
    templatePath: "components/emails/new-user-notification.tsx",
    template: NewUserNotification,
    previews: [{ variant: "default" }],
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
    audience: "recipient-localized",
    sourcePath: "features/company/invite-users-by-email.interactor.ts",
    templatePath: "components/emails/company-invite.tsx",
    template: CompanyInvite,
    previews: [{ variant: "default" }],
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
    audience: "operator-english",
    sourcePath: "features/contact/send-contact-inquiry.interactor.ts",
    templatePath: "components/emails/contact-inquiry.tsx",
    template: ContactInquiry,
    previews: [{ variant: "default" }],
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
    audience: "operator-english",
    sourcePath: "features/feedback/send-feedback.interactor.ts",
    templatePath: "components/emails/feedback.tsx",
    template: Feedback,
    previews: [{ variant: "default" }],
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
    key: "support-escalation",
    audience: "operator-english",
    sourcePath: "features/support/create-support-ticket.interactor.ts",
    templatePath: "components/emails/support-escalation.tsx",
    template: SupportEscalation,
    previews: [{ variant: "default" }],
    expectedText: () => "Support request",
    render: (locale) =>
      createElement(SupportEscalation, {
        ...previewLayoutProps(locale),
        userName: "Sofia Example",
        userEmail: "sofia@example.test",
        companyName: "Example Studio",
        conversationTitle: "#179: Synthetic support preview",
        lastMessages: "user: Please help me verify the account recovery flow.\nassistant: A teammate will follow up.",
      }),
  },
  {
    key: "trial-welcome",
    audience: "recipient-localized",
    sourcePath: "ee/lifecycle/send-welcome-and-demo.interactor.ts",
    templatePath: "components/emails/trial-welcome.tsx",
    template: TrialWelcome,
    previews: [{ variant: "default" }],
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
    audience: "recipient-localized",
    sourcePath: "ee/lifecycle/send-trial-extension-offer.interactor.ts",
    templatePath: "components/emails/trial-expired-offer.tsx",
    template: TrialExpiredOffer,
    previews: [{ variant: "default" }],
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
    audience: "recipient-localized",
    sourcePath: "ee/lifecycle/send-trial-inactivation-reminder.interactor.ts",
    templatePath: "components/emails/trial-inactivation-reminder.tsx",
    template: TrialInactivationReminder,
    previews: [{ variant: "default" }],
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
    audience: "recipient-localized",
    sourcePath: "ee/lifecycle/deactivate-trial-users-and-send-notice.interactor.ts",
    templatePath: "components/emails/trial-inactivation-notice.tsx",
    template: TrialInactivationNotice,
    previews: [{ variant: "default" }],
    expectedText: (locale) => catalog(locale).TrialInactivationNotice.title,
    render: (locale) => localizedInactivation(locale, catalog(locale).TrialInactivationNotice),
  },
  {
    key: "subscription-inactivation-notice",
    audience: "recipient-localized",
    sourcePath: "ee/lifecycle/deactivate-users-after-subscription-grace-period.interactor.ts",
    templatePath: "components/emails/trial-inactivation-notice.tsx",
    template: TrialInactivationNotice,
    previews: [
      {
        variant: "default",
        entryPath: "variants/subscription-inactivation-notice.tsx",
      },
    ],
    expectedText: (locale) => catalog(locale).SubscriptionInactivationNotice.title,
    render: (locale) => localizedInactivation(locale, catalog(locale).SubscriptionInactivationNotice),
  },
  {
    key: "accounts-removed-notice",
    audience: "recipient-localized",
    sourcePath: "ee/messaging/connect/delete-accounts-for-plan.interactor.ts",
    templatePath: "components/emails/accounts-removed-notice.tsx",
    template: AccountsRemovedNotice,
    previews: [{ variant: "default" }],
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
    key: "legal-document-notice",
    audience: "recipient-localized",
    sourcePath: "ee/lifecycle/send-legal-document-notices.interactor.ts",
    templatePath: "components/emails/legal-document-notice.tsx",
    template: LegalDocumentNotice,
    previews: [
      { variant: "contract" },
      {
        variant: "information",
        entryPath: "variants/legal-document-notice-information.tsx",
      },
    ],
    expectedText: (locale, variant) => {
      const copy = catalog(locale).LegalDocumentNotice;
      return variant === "contract" ? copy.contractTitle : copy.informationTitle;
    },
    render: (locale, variant) => {
      const copy = catalog(locale).LegalDocumentNotice;
      const includesContract = variant === "contract";
      const contractDeadline = localizedDate(locale, "2026-08-24T00:00:00.000Z");
      const supplierDeadline = localizedDate(locale, "2026-08-20T00:00:00.000Z");

      return createElement(LegalDocumentNotice, {
        ...previewLayoutProps(locale),
        body: includesContract ? copy.contractBody : copy.informationBody,
        deadline: includesContract ? contractDeadline : supplierDeadline,
        deadlineLabel: includesContract ? copy.contractDeadlineLabel : copy.subprocessorDeadlineLabel,
        documents: legalDocuments(
          locale,
          includesContract ? ["terms", "dpa", "privacy", "subprocessors"] : ["privacy", "subprocessors"],
        ),
        greeting: withFirstName(copy.greeting),
        objections: includesContract
          ? [copy.contractObjection, copy.subprocessorObjectionWithDeadline.replace("{deadline}", supplierDeadline)]
          : [copy.subprocessorObjection],
        signoff: copy.signoff,
        subject: includesContract ? copy.contractSubject : copy.informationSubject,
        title: includesContract ? copy.contractTitle : copy.informationTitle,
      });
    },
  },
] as const satisfies readonly EmailPreviewDefinition[];

export type EmailPreviewManifestEntry = (typeof EMAIL_PREVIEW_MANIFEST)[number];
export type EmailPreviewKey = (typeof EMAIL_PREVIEW_MANIFEST)[number]["key"];

export type EmailPreviewOptions = {
  locale?: unknown;
  variant?: EmailPreviewVariant;
};

export function emailPreviewEntryPath(definition: EmailPreviewDefinition, preview: EmailPreviewSpec): string {
  return preview.entryPath ?? definition.templatePath.replace("components/emails/", "");
}

export function renderEmailPreview(key: EmailPreviewKey, options: EmailPreviewOptions = {}): ReactElement {
  const definition = EMAIL_PREVIEW_MANIFEST.find((candidate) => candidate.key === key) as
    | EmailPreviewDefinition
    | undefined;
  if (!definition) throw new Error(`Unknown email preview behavior: ${key}`);

  const locale =
    definition.audience === "operator-english"
      ? DEFAULT_LOCALE
      : isAppLocale(options.locale)
        ? options.locale
        : DEFAULT_LOCALE;
  const variant = options.variant ?? definition.previews[0]?.variant;
  if (!variant || !definition.previews.some((preview) => preview.variant === variant))
    throw new Error(`Unknown ${key} preview variant: ${variant ?? "missing"}`);

  return definition.render(locale, variant);
}

export function previewLocalesFor(key: EmailPreviewKey): readonly AppLocale[] {
  const definition = EMAIL_PREVIEW_MANIFEST.find((candidate) => candidate.key === key);
  return definition?.audience === "operator-english" ? [DEFAULT_LOCALE] : APP_LOCALES;
}
