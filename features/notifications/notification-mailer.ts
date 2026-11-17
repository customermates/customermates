import type { NotificationRecipient, PendingEmailNotification } from "./notification.repo";

export type NotificationMailer = {
  isConfigured(): boolean;
  sendInstant(recipient: NotificationRecipient, notification: PendingEmailNotification): Promise<boolean>;
  sendDigest(recipient: NotificationRecipient, notifications: PendingEmailNotification[]): Promise<boolean>;
};
