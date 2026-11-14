import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { NotificationEmailMode, NotificationKind } from "@/generated/prisma";

export const NOTIFICATION_KINDS = ["assigned", "dueToday", "formSubmission", "ruleAlert", "replyReceived"] as const;
export const NOTIFICATION_EMAIL_MODES = ["instant", "digest", "off"] as const;

export const NotificationKindSchema = z.enum(NotificationKind);
export const NotificationEmailModeSchema = z.enum(NotificationEmailMode);

export const DEFAULT_NOTIFICATION_EMAIL_MODES = {
  assigned: "instant",
  dueToday: "digest",
  formSubmission: "instant",
  ruleAlert: "instant",
  replyReceived: "digest",
} as const satisfies Record<(typeof NOTIFICATION_KINDS)[number], (typeof NOTIFICATION_EMAIL_MODES)[number]>;

export const NOTIFICATION_TITLE_MAX_CHARS = 200;
export const NOTIFICATION_BODY_MAX_CHARS = 1000;
export const NOTIFICATION_HREF_MAX_CHARS = 500;
export const NOTIFICATION_RECIPIENT_LIMIT = 200;
export const NOTIFICATION_INBOX_LIMIT = 50;
export const NOTIFICATION_RETENTION_DAYS = 90;
export const NOTIFICATION_DIGEST_WINDOW_HOURS = 24;

export const NotifyMembersSchema = z
  .object({
    companyId: z.uuid(),
    recipients: z.array(z.uuid()).min(1).max(NOTIFICATION_RECIPIENT_LIMIT),
    kind: NotificationKindSchema,
    title: z.string().trim().min(1).max(NOTIFICATION_TITLE_MAX_CHARS),
    body: z.string().max(NOTIFICATION_BODY_MAX_CHARS).nullish(),
    href: z
      .string()
      .max(NOTIFICATION_HREF_MAX_CHARS)
      .refine((value) => value.startsWith("/") && !value.startsWith("//"), "href must be an app path")
      .nullish(),
    sourceRuleId: z.uuid().nullish(),
    dedupeKey: z.string().min(1).max(200).nullish(),
  })
  .strict();
export type NotifyMembersInput = z.input<typeof NotifyMembersSchema>;
export type NotifyMembersData = z.output<typeof NotifyMembersSchema>;

export const NotificationDtoSchema = z.object({
  id: z.uuid(),
  kind: NotificationKindSchema,
  title: z.string(),
  body: z.string().nullable(),
  href: z.string().nullable(),
  read: z.boolean(),
  createdAt: z.string(),
});
export type NotificationDto = Data<typeof NotificationDtoSchema>;

export const GetNotificationsSchema = z
  .object({
    limit: z.number().int().min(1).max(NOTIFICATION_INBOX_LIMIT).default(20),
    unreadOnly: z.boolean().default(false),
    before: z.string().optional(),
  })
  .strict();
export type GetNotificationsData = z.output<typeof GetNotificationsSchema>;

export const NotificationInboxSchema = z.object({
  items: z.array(NotificationDtoSchema),
  unreadCount: z.number().int().nonnegative(),
  nextBefore: z.string().nullable(),
});
export type NotificationInbox = z.infer<typeof NotificationInboxSchema>;

export const MarkNotificationsReadSchema = z
  .object({ ids: z.array(z.uuid()).min(1).max(100).optional(), all: z.boolean().optional() })
  .strict()
  .refine((input) => (input.ids ? !input.all : input.all === true), "Pass ids or all");
export type MarkNotificationsReadData = z.output<typeof MarkNotificationsReadSchema>;

export const MarkNotificationsReadResultSchema = z.object({ marked: z.number().int().nonnegative() });

export const NotificationPreferenceSchema = z.object({
  kind: NotificationKindSchema,
  emailMode: NotificationEmailModeSchema,
});
export type NotificationPreferenceDto = z.infer<typeof NotificationPreferenceSchema>;

export const NotificationPreferencesSchema = z.object({ preferences: z.array(NotificationPreferenceSchema) });
export type NotificationPreferencesDto = z.infer<typeof NotificationPreferencesSchema>;

export const SetNotificationPreferencesSchema = z
  .object({ preferences: z.array(NotificationPreferenceSchema).min(1).max(NOTIFICATION_KINDS.length) })
  .strict();
export type SetNotificationPreferencesData = z.output<typeof SetNotificationPreferencesSchema>;
