import enMessages from "@/i18n/locales/en.json";
import { EmailButton } from "@/components/emails/base/email-button";
import { EmailField } from "@/components/emails/base/email-field";
import { EmailLayout, type EmailLayoutSharedProps } from "@/components/emails/base/email-layout";
import { EmailSection } from "@/components/emails/base/email-section";
import { EmailText } from "@/components/emails/base/email-text";
import { PREVIEW_EMAIL_LAYOUT_PROPS } from "@/components/emails/preview-layout-props";

export type BookingEmailDetail = { label: string; value: string };

export type BookingEmailLink = { label: string; href: string };

export type BookingEmailProps = EmailLayoutSharedProps & {
  subject: string;
  title: string;
  greeting: string;
  intro: string;
  details: BookingEmailDetail[];
  manage: BookingEmailLink | null;
  accent: { background: string; text: string } | null;
  footer: string;
};

export default function BookingEmail({
  subject,
  title,
  greeting,
  intro,
  details,
  manage,
  accent,
  footer,
  ...layoutProps
}: BookingEmailProps) {
  return (
    <EmailLayout {...layoutProps} preview={subject} title={title}>
      <EmailText>{greeting}</EmailText>

      <EmailText>{intro}</EmailText>

      {details.map((detail) => (
        <EmailField key={detail.label} label={detail.label}>
          {detail.value}
        </EmailField>
      ))}

      {manage ? (
        <EmailSection>
          <EmailButton color={accent ?? undefined} href={manage.href}>
            {manage.label}
          </EmailButton>
        </EmailSection>
      ) : null}

      <EmailText className="text-sm text-default-700">{footer}</EmailText>
    </EmailLayout>
  );
}

const t = enMessages.BookingEmail;

BookingEmail.PreviewProps = {
  ...PREVIEW_EMAIL_LAYOUT_PROPS,
  brandName: "Hoffmann Consulting",
  subject: t.confirmedSubject.replace("{page}", "Intro call").replace("{date}", "Nov 20, 2026, 9:00 AM"),
  title: t.confirmedTitle,
  greeting: t.greeting.replace("{name}", "Sofia"),
  intro: t.confirmedIntro.replace("{page}", "Intro call").replace("{host}", "Anna Müller"),
  details: [
    { label: t.labelWhen, value: "Friday, November 20, 2026 at 9:00 AM (Europe/Berlin)" },
    { label: t.labelHost, value: "Anna Müller" },
  ],
  manage: { label: t.manage, href: "https://app.example.test/book/manage/preview" },
  accent: null,
  footer: t.footer.replace("{workspace}", "Hoffmann Consulting"),
} satisfies BookingEmailProps;
