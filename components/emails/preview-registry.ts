import type { ReactElement } from "react";
import type { AppLocale } from "@/i18n/locale-registry";
import type { EmailLayoutCopy } from "./base/email-layout-copy";

import { createElement } from "react";

import deMessages from "@/i18n/locales/de.json";
import enMessages from "@/i18n/locales/en.json";
import esMessages from "@/i18n/locales/es.json";
import frMessages from "@/i18n/locales/fr.json";
import itMessages from "@/i18n/locales/it.json";
import { APP_LOCALES, DEFAULT_LOCALE, formattingTagFor, isAppLocale } from "@/i18n/locale-registry";
import { LEGAL_DOCUMENT_VERSIONS, type LegalDocument } from "@/constants/legal-documents";
import { PREVIEW_EMAIL_LAYOUT_COPY } from "./base/email-layout-copy";

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

export const EMAIL_PREVIEW_BEHAVIORS = [
  {
    key: "verify-email",
    audience: "recipient-localized",
    sourcePath: "features/auth/auth.service.ts",
    templatePath: "components/emails/verify-email.tsx",
    variants: ["default"],
  },
  {
    key: "reset-password",
    audience: "recipient-localized",
    sourcePath: "features/auth/auth.service.ts",
    templatePath: "components/emails/reset-password.tsx",
    variants: ["default"],
  },
  {
    key: "new-user-notification",
    audience: "operator-english",
    sourcePath: "features/auth/auth.service.ts",
    templatePath: "components/emails/new-user-notification.tsx",
    variants: ["default"],
  },
  {
    key: "company-invite",
    audience: "recipient-localized",
    sourcePath: "features/company/invite-users-by-email.interactor.ts",
    templatePath: "components/emails/company-invite.tsx",
    variants: ["default"],
  },
  {
    key: "contact-inquiry",
    audience: "operator-english",
    sourcePath: "features/contact/send-contact-inquiry.interactor.ts",
    templatePath: "components/emails/contact-inquiry.tsx",
    variants: ["default"],
  },
  {
    key: "feedback",
    audience: "operator-english",
    sourcePath: "features/feedback/send-feedback.interactor.ts",
    templatePath: "components/emails/feedback.tsx",
    variants: ["default"],
  },
  {
    key: "support-escalation",
    audience: "operator-english",
    sourcePath: "features/support/create-support-ticket.interactor.ts",
    templatePath: "components/emails/support-escalation.tsx",
    variants: ["default"],
  },
  {
    key: "trial-welcome",
    audience: "recipient-localized",
    sourcePath: "ee/lifecycle/send-welcome-and-demo.interactor.ts",
    templatePath: "components/emails/trial-welcome.tsx",
    variants: ["default"],
  },
  {
    key: "trial-extension-offer",
    audience: "recipient-localized",
    sourcePath: "ee/lifecycle/send-trial-extension-offer.interactor.ts",
    templatePath: "components/emails/trial-expired-offer.tsx",
    variants: ["default"],
  },
  {
    key: "trial-inactivation-reminder",
    audience: "recipient-localized",
    sourcePath: "ee/lifecycle/send-trial-inactivation-reminder.interactor.ts",
    templatePath: "components/emails/trial-inactivation-reminder.tsx",
    variants: ["default"],
  },
  {
    key: "trial-inactivation-notice",
    audience: "recipient-localized",
    sourcePath: "ee/lifecycle/deactivate-trial-users-and-send-notice.interactor.ts",
    templatePath: "components/emails/trial-inactivation-notice.tsx",
    variants: ["default"],
  },
  {
    key: "subscription-inactivation-notice",
    audience: "recipient-localized",
    sourcePath: "ee/lifecycle/deactivate-users-after-subscription-grace-period.interactor.ts",
    templatePath: "components/emails/trial-inactivation-notice.tsx",
    variants: ["default"],
  },
  {
    key: "accounts-removed-notice",
    audience: "recipient-localized",
    sourcePath: "ee/messaging/connect/delete-accounts-for-plan.interactor.ts",
    templatePath: "components/emails/accounts-removed-notice.tsx",
    variants: ["default"],
  },
  {
    key: "legal-document-notice",
    audience: "recipient-localized",
    sourcePath: "ee/lifecycle/send-legal-document-notices.interactor.ts",
    templatePath: "components/emails/legal-document-notice.tsx",
    variants: ["contract", "information"],
  },
] as const;

export type EmailPreviewBehavior = (typeof EMAIL_PREVIEW_BEHAVIORS)[number];
export type EmailPreviewKey = EmailPreviewBehavior["key"];
export type LegalPreviewVariant = "contract" | "information";

export const EMAIL_PREVIEW_ENTRIES = [
  { filePath: "accounts-removed-notice.tsx", key: "accounts-removed-notice" },
  { filePath: "company-invite.tsx", key: "company-invite" },
  { filePath: "contact-inquiry.tsx", key: "contact-inquiry" },
  { filePath: "feedback.tsx", key: "feedback" },
  {
    filePath: "legal-document-notice.tsx",
    key: "legal-document-notice",
    variant: "contract",
  },
  { filePath: "new-user-notification.tsx", key: "new-user-notification" },
  { filePath: "reset-password.tsx", key: "reset-password" },
  { filePath: "support-escalation.tsx", key: "support-escalation" },
  { filePath: "trial-expired-offer.tsx", key: "trial-extension-offer" },
  {
    filePath: "trial-inactivation-notice.tsx",
    key: "trial-inactivation-notice",
  },
  {
    filePath: "trial-inactivation-reminder.tsx",
    key: "trial-inactivation-reminder",
  },
  { filePath: "trial-welcome.tsx", key: "trial-welcome" },
  { filePath: "verify-email.tsx", key: "verify-email" },
  {
    filePath: "variants/legal-document-notice-information.tsx",
    key: "legal-document-notice",
    variant: "information",
  },
  {
    filePath: "variants/subscription-inactivation-notice.tsx",
    key: "subscription-inactivation-notice",
  },
] as const satisfies readonly {
  filePath: string;
  key: EmailPreviewKey;
  variant?: LegalPreviewVariant;
}[];

export type EmailPreviewOptions = {
  locale?: unknown;
  variant?: LegalPreviewVariant;
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

function localeFor(key: EmailPreviewKey, requestedLocale: unknown): AppLocale {
  const behavior = EMAIL_PREVIEW_BEHAVIORS.find((candidate) => candidate.key === key);
  if (behavior?.audience === "operator-english") return DEFAULT_LOCALE;
  return isAppLocale(requestedLocale) ? requestedLocale : DEFAULT_LOCALE;
}

function layoutCopy(locale: AppLocale): EmailLayoutCopy & { iconUrl: string } {
  return {
    country: new Intl.DisplayNames([formattingTagFor(locale)], { type: "region" }).of("DE") ?? "DE",
    iconUrl: PREVIEW_EMAIL_LAYOUT_COPY.iconUrl,
    tagline: catalog(locale).EmailLayout.tagline,
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
    locale,
    layoutCopy: layoutCopy(locale),
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

function renderBehavior(key: EmailPreviewKey, locale: AppLocale, variant: LegalPreviewVariant): ReactElement {
  const messages = catalog(locale);
  const common = { locale, layoutCopy: layoutCopy(locale) };

  switch (key) {
    case "verify-email": {
      const copy = messages.VerifyEmail;
      return createElement(VerifyEmail, {
        ...common,
        url: `${PREVIEW_BASE_URL}/auth/verify-email?token=synthetic-preview-token`,
        ...copy,
      });
    }
    case "reset-password": {
      const copy = messages.ResetPassword;
      return createElement(ResetPassword, {
        ...common,
        url: `${PREVIEW_BASE_URL}/auth/reset-password?token=synthetic-preview-token`,
        ...copy,
      });
    }
    case "new-user-notification":
      return createElement(NewUserNotification, {
        ...common,
        email: "sofia@example.test",
        name: "Sofia Example",
        provider: "Google",
      });
    case "company-invite": {
      const copy = messages.CompanyInvite;
      return createElement(CompanyInvite, {
        ...common,
        inviteLink: `${PREVIEW_BASE_URL}/invitation/synthetic-preview-token`,
        subject: copy.subject,
        preview: withInviter(copy.preview),
        intro: withInviter(copy.intro),
        cta: copy.cta,
        fallback: copy.fallback,
      });
    }
    case "contact-inquiry":
      return createElement(ContactInquiry, {
        ...common,
        name: "Sofia Example",
        email: "sofia@example.test",
        company: "Example Studio",
        message: "I would like to learn how Customermates can support our synthetic preview team.",
      });
    case "feedback":
      return createElement(Feedback, {
        ...common,
        feedback: "The new account recovery flow is clear and easy to follow.",
        userEmail: "sofia@example.test",
        userName: "Sofia Example",
        subject: "General Feedback",
      });
    case "support-escalation":
      return createElement(SupportEscalation, {
        ...common,
        userName: "Sofia Example",
        userEmail: "sofia@example.test",
        companyName: "Example Studio",
        conversationTitle: "#179: Synthetic support preview",
        lastMessages: "user: Please help me verify the account recovery flow.\nassistant: A teammate will follow up.",
      });
    case "trial-welcome": {
      const copy = messages.TrialWelcome;
      return createElement(TrialWelcome, {
        ...common,
        ...copy,
        greeting: withFirstName(copy.greeting),
      });
    }
    case "trial-extension-offer": {
      const copy = messages.TrialExpiredOffer;
      return createElement(TrialExpiredOffer, {
        ...common,
        ...copy,
        greeting: withFirstName(copy.greeting),
        href: `${PREVIEW_BASE_URL}/contact`,
      });
    }
    case "trial-inactivation-reminder": {
      const copy = messages.TrialInactivationReminder;
      return createElement(TrialInactivationReminder, {
        ...common,
        ...copy,
        greeting: withFirstName(copy.greeting),
        href: `${PREVIEW_BASE_URL}/contact`,
      });
    }
    case "trial-inactivation-notice":
      return localizedInactivation(locale, messages.TrialInactivationNotice);
    case "subscription-inactivation-notice":
      return localizedInactivation(locale, messages.SubscriptionInactivationNotice);
    case "accounts-removed-notice": {
      const copy = messages.AccountsRemovedNotice;
      const accounts = `${messages.Common.providers.linkedin} (Sofia), ${messages.Common.providers.google} (sofia@example.test)`;
      return createElement(AccountsRemovedNotice, {
        ...common,
        ...copy,
        greeting: withFirstName(copy.greeting),
        body: copy.body.replace("{accounts}", accounts).replace("{plan}", messages.Subscription.planNames.pro),
        href: `${PREVIEW_BASE_URL}/profile/connected-accounts`,
      });
    }
    case "legal-document-notice": {
      const copy = messages.LegalDocumentNotice;
      const includesContract = variant === "contract";
      const contractDeadline = localizedDate(locale, "2026-08-24T00:00:00.000Z");
      const supplierDeadline = localizedDate(locale, "2026-08-20T00:00:00.000Z");
      const subject = includesContract ? copy.contractSubject : copy.informationSubject;

      return createElement(LegalDocumentNotice, {
        ...common,
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
        subject,
        title: includesContract ? copy.contractTitle : copy.informationTitle,
      });
    }
  }
}

export function renderEmailPreview(key: EmailPreviewKey, options: EmailPreviewOptions = {}): ReactElement {
  const locale = localeFor(key, options.locale);
  return renderBehavior(key, locale, options.variant ?? "contract");
}

export function previewLocalesFor(key: EmailPreviewKey): readonly AppLocale[] {
  const behavior = EMAIL_PREVIEW_BEHAVIORS.find((candidate) => candidate.key === key);
  return behavior?.audience === "operator-english" ? [DEFAULT_LOCALE] : APP_LOCALES;
}
