import { createHash } from "node:crypto";

import { createElement } from "react";

import type { NotificationKind } from "@/generated/prisma";
import type { EmailService } from "@/features/email/email.service";
import type { NotificationMailer } from "./notification-mailer";
import type { NotificationRecipient, PendingEmailNotification } from "./notification.repo";

import NotificationEmail from "@/components/emails/notification-email";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { absoluteWorkspaceUrl } from "@/core/navigation/workspace-paths";
import { env } from "@/env";
import { getTranslator } from "@/i18n/get-translator";
import { formattingTagFor } from "@/i18n/locale-registry";
import { resolveUserLocale } from "@/i18n/user-locale";

import { NOTIFICATION_DIGEST_ITEM_LIMIT, NOTIFICATIONS_PATH } from "./notification.schema";
import { notificationUnsubscribeSecret, signNotificationUnsubscribe } from "./notification-unsubscribe-token";

const UNSUBSCRIBE_PATH = "/api/notifications/unsubscribe";
const MANAGE_PATH = "/settings/profile";

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function deliveryKey(notifications: PendingEmailNotification[]): string {
  const ids = notifications.map((item) => item.id);
  return ids.length === 1 ? ids[0] : createHash("sha256").update(ids.sort().join(",")).digest("hex");
}

export class EmailNotificationMailer implements NotificationMailer {
  constructor(
    private readonly emailService: Pick<EmailService, "send" | "isConfigured">,
    private readonly authSecret: string | undefined,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  isConfigured(): boolean {
    return this.emailService.isConfigured();
  }

  sendInstant(recipient: NotificationRecipient, notification: PendingEmailNotification): Promise<boolean> {
    return this.send(recipient, [notification], "instant");
  }

  sendDigest(recipient: NotificationRecipient, notifications: PendingEmailNotification[]): Promise<boolean> {
    return this.send(recipient, notifications, "digest");
  }

  private async send(
    recipient: NotificationRecipient,
    notifications: PendingEmailNotification[],
    mode: "instant" | "digest",
  ): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const locale = resolveUserLocale(recipient);
    const t = await getTranslator(locale, "NotificationEmail");
    const kindLabels = await getTranslator(locale, "Notifications");
    const layoutCopy = await getEmailLayoutCopy(locale);
    const first = notifications[0];
    const inboxUrl = absoluteWorkspaceUrl(env.BASE_URL, locale, recipient.workspaceSlug, NOTIFICATIONS_PATH);
    const link = mode === "digest" ? NOTIFICATIONS_PATH : (first?.href ?? "/dashboard");
    const hidden = notifications.length - NOTIFICATION_DIGEST_ITEM_LIMIT;
    const subject = mode === "instant" && first ? first.title : t("digestSubject");
    const kindLabel = (kind: NotificationKind) => kindLabels(`kinds.${kind}`);
    const sources = distinct(notifications.map((item) => item.sourceRuleName ?? kindLabel(item.kind)));
    const kinds = distinct(notifications.map((item) => item.kind));
    const secret = notificationUnsubscribeSecret(this.authSecret);
    const turnOffLinks =
      secret && first
        ? kinds.map((kind) => ({
            label: kinds.length === 1 ? t("turnOffKind") : t("turnOffNamedKind", { kind: kindLabel(kind) }),
            href: `${env.BASE_URL.replace(/\/+$/u, "")}${UNSUBSCRIBE_PATH}?token=${encodeURIComponent(
              signNotificationUnsubscribe(
                secret,
                { userId: recipient.id, companyId: first.companyId, kind },
                this.clock(),
              ),
            )}`,
          }))
        : [];
    return this.emailService.send({
      to: recipient.email,
      subject,
      react: createElement(NotificationEmail, {
        locale,
        layoutCopy,
        greeting: t("greeting", { firstName: recipient.firstName }),
        intro: mode === "instant" ? t("instantIntro") : t("digestIntro"),
        items: notifications
          .slice(0, NOTIFICATION_DIGEST_ITEM_LIMIT)
          .map((item) => ({ title: item.title, ...(item.body ? { body: item.body } : {}) })),
        ...(hidden > 0 ? { more: { label: t("digestMore", { count: hidden }), href: inboxUrl } } : {}),
        cta: t("cta"),
        href: absoluteWorkspaceUrl(env.BASE_URL, locale, recipient.workspaceSlug, link),
        footerReason: t("footerReason", {
          count: sources.length,
          sources: new Intl.ListFormat(formattingTagFor(locale), { style: "long", type: "conjunction" }).format(
            sources,
          ),
        }),
        turnOffLinks,
        manage: {
          label: t("manageNotifications"),
          href: absoluteWorkspaceUrl(env.BASE_URL, locale, recipient.workspaceSlug, MANAGE_PATH),
        },
        subject,
        title: t("title"),
      }),
      deduplicationKey: `notification:${mode}:${deliveryKey(notifications)}`,
    });
  }
}
