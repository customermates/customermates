import type { EmailService } from "@/features/email/email.service";
import type { AppLocale } from "@/i18n/locale-registry";

import { createElement } from "react";

import * as ErrorReporter from "@/core/observability/server";

import BookingEmail, { type BookingEmailDetail, type BookingEmailProps } from "@/components/emails/booking-email";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { stripControlCharacters } from "@/core/utils/strip-control-characters";
import { senderNamed } from "@/features/email/email.service";
import { brandForeground, isBrandColor } from "@/features/workspace-brand/brand-color";
import { brandLogoUrl } from "@/features/workspace-brand/workspace-brand.schema";
import { getTranslator } from "@/i18n/get-translator";
import { appLocaleOrDefault, formattingTagFor } from "@/i18n/locale-registry";

import type { BookingRow } from "./booking-reservation.repo";

import { bookingManageUrl, invitationName } from "./booking-invitation";

export type BookingMailActor = "invitee" | "host";

export type BookingMailRow = Pick<
  BookingRow,
  | "id"
  | "inviteeName"
  | "inviteeEmail"
  | "startsAt"
  | "timeZone"
  | "linkTitle"
  | "linkInviteeChanges"
  | "hostName"
  | "hostEmail"
  | "workspaceName"
  | "brand"
  | "manageToken"
  | "locale"
>;

export type BookingMail =
  | { kind: "confirmed"; booking: BookingMailRow }
  | { kind: "reminder"; booking: BookingMailRow }
  | { kind: "rescheduled"; booking: BookingMailRow; by: BookingMailActor; previousStartsAt: Date }
  | { kind: "cancelled"; booking: BookingMailRow; by: BookingMailActor; reason: string | null };

export type BookingMessage = {
  to: string;
  from: string;
  replyTo: string | undefined;
  subject: string;
  deduplicationKey: string;
  locale: AppLocale;
  props: BookingEmailProps;
};

const SENDER_SUFFIX = "via Customermates";

export function bookingMailLocale(booking: Pick<BookingRow, "locale">): AppLocale {
  return appLocaleOrDefault(booking.locale);
}

export function visitorWhen(at: Date, locale: AppLocale, timeZone: string): string {
  const when = new Intl.DateTimeFormat(formattingTagFor(locale), {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(at);

  return `${when} (${timeZone})`;
}

function visitorDate(at: Date, locale: AppLocale, timeZone: string): string {
  return new Intl.DateTimeFormat(formattingTagFor(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(at);
}

export function bookingMailKey(mail: BookingMail): string {
  const base = `booking-mail/${mail.booking.id}/${mail.kind}`;

  return mail.kind === "cancelled" || mail.kind === "confirmed"
    ? base
    : `${base}/${mail.booking.startsAt.toISOString()}`;
}

function accentOf(color: string | null | undefined): BookingEmailProps["accent"] {
  if (!isBrandColor(color)) return null;

  return { background: color, text: brandForeground(color) };
}

function absoluteLogo(baseUrl: string, logoKey: string | null | undefined): string | null {
  return logoKey ? `${baseUrl.replace(/\/$/u, "")}${brandLogoUrl(logoKey)}` : null;
}

export async function bookingMessage(mail: BookingMail, baseUrl: string): Promise<BookingMessage> {
  const { booking } = mail;
  const locale = bookingMailLocale(booking);
  const t = await getTranslator(locale, "BookingEmail");
  const workspace = stripControlCharacters(booking.workspaceName ?? "").trim();
  const page = booking.linkTitle;
  const host = booking.hostName;
  const date = visitorDate(booking.startsAt, locale, booking.timeZone);
  const when = visitorWhen(booking.startsAt, locale, booking.timeZone);
  const name = invitationName(booking.inviteeName);
  const whenDetail: BookingEmailDetail = { label: t("labelWhen"), value: when };
  const hostDetail: BookingEmailDetail = { label: t("labelHost"), value: host };
  const manageUrl =
    mail.kind !== "cancelled" && booking.linkInviteeChanges ? bookingManageUrl(baseUrl, booking.manageToken) : null;

  let subject: string;
  let title: string;
  let intro: string;
  let details: BookingEmailDetail[];
  switch (mail.kind) {
    case "confirmed":
      subject = t("confirmedSubject", { page, date });
      title = t("confirmedTitle");
      intro = t("confirmedIntro", { page, host });
      details = [whenDetail, hostDetail];
      break;
    case "reminder":
      subject = t("reminderSubject", { page, date });
      title = t("reminderTitle");
      intro = t("reminderIntro", { page, host });
      details = [whenDetail, hostDetail];
      break;
    case "rescheduled":
      subject = t("rescheduledSubject", { page, date });
      title = t("rescheduledTitle");
      intro =
        mail.by === "host" ? t("rescheduledIntroHost", { page, host }) : t("rescheduledIntroInvitee", { page, host });
      details = [
        { label: t("labelNewWhen"), value: when },
        { label: t("labelPrevious"), value: visitorWhen(mail.previousStartsAt, locale, booking.timeZone) },
        hostDetail,
      ];
      break;
    case "cancelled": {
      subject = t("cancelledSubject", { page, date });
      title = t("cancelledTitle");
      intro = mail.by === "host" ? t("cancelledIntroHost", { page, host }) : t("cancelledIntroInvitee", { page, host });
      const reason = mail.by === "host" && mail.reason ? stripControlCharacters(mail.reason).trim() : "";
      details = reason ? [whenDetail, { label: t("labelReason"), value: reason }] : [whenDetail];
      break;
    }
  }

  return {
    to: booking.inviteeEmail,
    from: senderNamed(workspace ? `${workspace} ${SENDER_SUFFIX}` : ""),
    replyTo: booking.hostEmail || undefined,
    subject,
    deduplicationKey: bookingMailKey(mail),
    locale,
    props: {
      locale,
      layoutCopy: await getEmailLayoutCopy(locale),
      logoUrl: absoluteLogo(baseUrl, booking.brand?.logoKey),
      ...(workspace ? { brandName: workspace } : {}),
      subject,
      title,
      greeting: name ? t("greeting", { name }) : t("greetingNoName"),
      intro,
      details,
      manage: manageUrl ? { label: t("manage"), href: manageUrl } : null,
      accent: accentOf(booking.brand?.accentColor),
      footer: t("footer", { workspace: workspace || host }),
    },
  };
}

export class BookingMailer {
  constructor(
    private emailService: Pick<EmailService, "send">,
    private baseUrl: string,
  ) {}

  async send(mail: BookingMail): Promise<boolean> {
    try {
      const message = await bookingMessage(mail, this.baseUrl);
      const sent = await this.emailService.send({
        to: message.to,
        from: message.from,
        replyTo: message.replyTo,
        subject: message.subject,
        deduplicationKey: message.deduplicationKey,
        react: createElement(BookingEmail, message.props),
      });
      return sent;
    } catch (error) {
      ErrorReporter.captureException(error, { tags: { kind: `booking-mail-${mail.kind}` } });
      return false;
    }
  }
}
