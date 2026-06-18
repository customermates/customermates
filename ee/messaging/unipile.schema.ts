import { z } from "zod";

const UnipileDateSchema = z
  .union([z.string(), z.number(), z.date()])
  .nullish()
  .transform((value, ctx) => {
    if (value instanceof Date) return value;
    if (value == null) return new Date();

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: "custom", message: `invalid date: ${value}` });
      return z.NEVER;
    }

    return date;
  });

const UnipileBooleanSchema = z
  .union([z.literal(0), z.literal(1), z.boolean()])
  .transform((value) => value === 1 || value === true);

const UnipileAttendeeSpecificsSchema = z.looseObject({
  phone_number: z.string().nullish(),
  occupation: z.string().nullish(),
  headline: z.string().nullish(),
});

const UnipileEmailAttendeeSchema = z.looseObject({
  display_name: z.string().nullish(),
  identifier: z.string().nullish(),
  identifier_type: z.string().nullish(),
  profile_picture: z.string().nullish(),
});

const UnipileEmailAttachmentSchema = z.looseObject({
  id: z.string().nullish(),
  name: z.string().nullish(),
  extension: z.string().nullish(),
  size: z.number().nullish(),
  mime: z.string().nullish(),
  cid: z.string().nullish(),
});

const UnipileEmailFields = {
  email_id: z.string().nullish(),
  role: z.string().nullish(),
  origin: z.enum(["unipile", "external"]).nullish(),
  subject: z.string().nullish(),
  body: z.string().nullish(),
  body_plain: z.string().nullish(),
  from_attendee: UnipileEmailAttendeeSchema.nullish(),
  to_attendees: z.array(UnipileEmailAttendeeSchema).nullish(),
  cc_attendees: z.array(UnipileEmailAttendeeSchema).nullish(),
  bcc_attendees: z.array(UnipileEmailAttendeeSchema).nullish(),
  attachments: z.array(UnipileEmailAttachmentSchema).nullish(),
  date: UnipileDateSchema,
} as const;

const UnipileChatAttachmentSchema = z.looseObject({
  id: z.string().nullish(),
  type: z.string().nullish(),
  mimetype: z.string().nullish(),
  file_name: z.string().nullish(),
  file_size: z.number().nullish(),
  url: z.string().nullish(),
  size: z
    .union([
      z.number(),
      z.looseObject({
        height: z.union([z.string(), z.number()]).nullish(),
        width: z.union([z.string(), z.number()]).nullish(),
      }),
    ])
    .nullish(),
  sticker: z.boolean().nullish(),
  voice_note: z.boolean().nullish(),
  gif: z.boolean().nullish(),
  duration: z.number().nullish(),
  unavailable: z.boolean().nullish(),
  attachment_id: z.string().nullish(),
  attachment_type: z.string().nullish(),
  attachment_url: z.string().nullish(),
  attachment_size: z.number().nullish(),
});
export type UnipileChatAttachment = z.infer<typeof UnipileChatAttachmentSchema>;

const UnipileWebhookAttendeeSchema = z.looseObject({
  attendee_id: z.string().nullish(),
  attendee_name: z.string().nullish(),
  attendee_provider_id: z.string().nullish(),
  attendee_public_identifier: z.string().nullish(),
  attendee_profile_url: z.string().nullish(),
  attendee_profile_picture_url: z.string().nullish(),
  attendee_specifics: UnipileAttendeeSpecificsSchema.nullish(),
});
export type UnipileWebhookAttendee = z.infer<typeof UnipileWebhookAttendeeSchema>;

export const UnipileChatAttendeeSchema = z.looseObject({
  id: z.string().nullish(),
  provider_id: z.string().nullish(),
  name: z.string().nullish(),
  is_self: UnipileBooleanSchema.nullish(),
  public_identifier: z.string().nullish(),
  picture_url: z.string().nullish(),
  profile_url: z.string().nullish(),
  specifics: UnipileAttendeeSpecificsSchema.nullish(),
});
export type UnipileChatAttendee = z.infer<typeof UnipileChatAttendeeSchema>;

export const UnipileAccountSchema = z.looseObject({
  type: z.string(),
  name: z.string().nullish(),
  sources: z.array(z.looseObject({ id: z.string().nullish(), status: z.string().nullish() })).nullish(),
  connection_params: z
    .looseObject({
      mail: z
        .looseObject({
          imap_user: z.string().nullish(),
          username: z.string().nullish(),
        })
        .nullish(),
      im: z.looseObject({ premiumFeatures: z.array(z.string()).nullish() }).nullish(),
    })
    .nullish(),
});
export type UnipileAccount = z.infer<typeof UnipileAccountSchema>;

export const UnipileOwnerProfileSchema = z.looseObject({
  profile_picture_url: z.string().nullish(),
});
export type UnipileOwnerProfile = z.infer<typeof UnipileOwnerProfileSchema>;

export const UnipileProviderProfileSchema = z.looseObject({
  provider_id: z.string().nullish(),
  provider_messaging_id: z.string().nullish(),
  public_identifier: z.string().nullish(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  name: z.string().nullish(),
  public_profile_url: z.string().nullish(),
  profile_picture_url: z.string().nullish(),
  headline: z.string().nullish(),
});

export const UnipileCursorPageSchema = z.looseObject({
  data: z.array(z.unknown()).nullish(),
  next_cursor: z.string().nullish(),
});

const UnipileChatTypeSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]).transform((value) => {
  if (value === 0) return "single" as const;
  if (value === 1) return "group" as const;
  return "channel" as const;
});

export const UnipileEmailSchema = z.looseObject({
  id: z.string().nullish(),
  thread_id: z.string().nullish(),
  type: z.string().nullish(),
  ...UnipileEmailFields,
});
export type UnipileEmail = z.infer<typeof UnipileEmailSchema>;

export const UnipileChatSchema = z.looseObject({
  id: z.string().nullish(),
  type: UnipileChatTypeSchema.nullish(),
  name: z.string().nullish(),
  subject: z.string().nullish(),
  attendee_provider_id: z.string().nullish(),
  timestamp: UnipileDateSchema,
});

export const UnipileChatMessageSchema = z.looseObject({
  id: z.string().nullish(),
  chat_id: z.string().nullish(),
  sender_id: z.string().nullish(),
  sender_attendee_id: z.string().nullish(),
  is_sender: UnipileBooleanSchema.nullish(),
  hidden: UnipileBooleanSchema.nullish(),
  deleted: UnipileBooleanSchema.nullish(),
  is_event: UnipileBooleanSchema.nullish(),
  timestamp: UnipileDateSchema,
  text: z.string().nullish(),
  seen_by: z.record(z.string(), z.union([z.string(), z.boolean()])).nullish(),
  reactions: z
    .array(
      z.looseObject({
        value: z.string().nullish(),
        sender_id: z.string().nullish(),
        is_sender: z.boolean().nullish(),
      }),
    )
    .nullish(),
  attachments: z.array(UnipileChatAttachmentSchema).nullish(),
});

const UnipileMessagingWebhookFields = {
  account_id: z.string(),
  account_type: z.string().nullish(),
  account_info: z.looseObject({ user_id: z.string().nullish() }).nullish(),
  chat_id: z.string().nullish(),
  message_id: z.string().min(1),
  timestamp: UnipileDateSchema,
  message: z.string().nullish(),
  sender: UnipileWebhookAttendeeSchema.nullish(),
  is_sender: UnipileBooleanSchema.nullish(),
  attendees: z.array(UnipileWebhookAttendeeSchema).nullish(),
  attachments: z.array(UnipileChatAttachmentSchema).nullish(),
  is_event: UnipileBooleanSchema.nullish(),
  hidden: UnipileBooleanSchema.nullish(),
  is_group: z.boolean().nullish(),
} as const;

const UnipileMessageReceivedEventSchema = z.looseObject({
  event: z.literal("message_received"),
  ...UnipileMessagingWebhookFields,
});
const UnipileMessageReadEventSchema = z.looseObject({
  event: z.literal("message_read"),
  ...UnipileMessagingWebhookFields,
});
const UnipileMessageDeliveredEventSchema = z.looseObject({
  event: z.literal("message_delivered"),
  ...UnipileMessagingWebhookFields,
});
const UnipileMessageReactionEventSchema = z.looseObject({
  event: z.literal("message_reaction"),
  ...UnipileMessagingWebhookFields,
  reaction: z.string().nullish(),
  reaction_sender: UnipileWebhookAttendeeSchema.nullish(),
});
const UnipileMessageEditedEventSchema = z.looseObject({
  event: z.literal("message_edited"),
  ...UnipileMessagingWebhookFields,
});
const UnipileMessageDeletedEventSchema = z.looseObject({
  event: z.literal("message_deleted"),
  ...UnipileMessagingWebhookFields,
});

export const UnipileMessagingWebhookSchema = z.discriminatedUnion("event", [
  UnipileMessageReceivedEventSchema,
  UnipileMessageReadEventSchema,
  UnipileMessageDeliveredEventSchema,
  UnipileMessageReactionEventSchema,
  UnipileMessageEditedEventSchema,
  UnipileMessageDeletedEventSchema,
]);
export type UnipileMessagingWebhook = z.infer<typeof UnipileMessagingWebhookSchema>;
export type UnipileMessageReceivedEvent = z.infer<typeof UnipileMessageReceivedEventSchema>;
export type UnipileMessageReadEvent = z.infer<typeof UnipileMessageReadEventSchema>;
export type UnipileMessageDeliveredEvent = z.infer<typeof UnipileMessageDeliveredEventSchema>;
export type UnipileMessageReactionEvent = z.infer<typeof UnipileMessageReactionEventSchema>;
export type UnipileMessageEditedEvent = z.infer<typeof UnipileMessageEditedEventSchema>;
export type UnipileMessageDeletedEvent = z.infer<typeof UnipileMessageDeletedEventSchema>;

const UnipileEmailWebhookFields = {
  account_id: z.string(),
  ...UnipileEmailFields,
  reply_to_attendees: z.array(UnipileEmailAttendeeSchema).nullish(),
  has_attachments: z.boolean().nullish(),
  folders: z.array(z.string()).nullish(),
  previous_folders: z.array(z.string()).nullish(),
  read_date: z.string().nullish(),
  is_complete: z.boolean().nullish(),
} as const;

const UnipileEmailReceivedEventSchema = z.looseObject({
  event: z.literal("mail_received"),
  ...UnipileEmailWebhookFields,
});
const UnipileEmailSentEventSchema = z.looseObject({
  event: z.literal("mail_sent"),
  ...UnipileEmailWebhookFields,
});
const UnipileEmailMovedEventSchema = z.looseObject({
  event: z.literal("mail_moved"),
  ...UnipileEmailWebhookFields,
  email_id: z.string().min(1),
});

export const UnipileEmailWebhookSchema = z.discriminatedUnion("event", [
  UnipileEmailReceivedEventSchema,
  UnipileEmailSentEventSchema,
  UnipileEmailMovedEventSchema,
]);
export type UnipileEmailWebhook = z.infer<typeof UnipileEmailWebhookSchema>;
export type UnipileEmailReceivedEvent = z.infer<typeof UnipileEmailReceivedEventSchema>;
export type UnipileEmailSentEvent = z.infer<typeof UnipileEmailSentEventSchema>;
export type UnipileEmailMovedEvent = z.infer<typeof UnipileEmailMovedEventSchema>;

const UnipileAccountStatusSchema = z.enum([
  "OK",
  "ERROR",
  "STOPPED",
  "CREDENTIALS",
  "CONNECTING",
  "PERMISSIONS",
  "DELETED",
  "CREATION_SUCCESS",
  "CREATION_FAIL",
  "RECONNECTED",
  "SYNC_SUCCESS",
]);
export type UnipileAccountStatus = z.infer<typeof UnipileAccountStatusSchema>;

export const UnipileAccountStatusWebhookSchema = z.looseObject({
  AccountStatus: z.looseObject({
    account_id: z.string(),
    account_type: z.string(),
    message: UnipileAccountStatusSchema,
    reason: z.string().nullish(),
  }),
  Product: z.string().nullish(),
});
export type UnipileAccountStatusWebhook = z.infer<typeof UnipileAccountStatusWebhookSchema>;

export const UnipileUsersWebhookSchema = z.looseObject({
  event: z.literal("new_relation"),
  account_id: z.string(),
  account_type: z.literal("LINKEDIN").nullish(),
  user_provider_id: z.string().nullish(),
  user_full_name: z.string().nullish(),
  user_profile_url: z.string().nullish(),
  user_public_identifier: z.string().nullish(),
  user_picture_url: z.string().nullish(),
  timestamp: UnipileDateSchema,
});
export type UnipileUsersWebhook = z.infer<typeof UnipileUsersWebhookSchema>;

export const UnipileHostedAuthCallbackSchema = z.looseObject({
  status: z.enum(["CREATION_SUCCESS", "CREATION_FAIL", "RECONNECTED"]),
  account_id: z.string(),
  account_type: z.string().nullish(),
  // Not a display name: this is the connecting user's id, which we put in the hosted-auth
  // link's `name` field and Unipile echoes back here. Used to resolve the owning user/company.
  name: z.string().min(1),
});
export type UnipileHostedAuthCallback = z.infer<typeof UnipileHostedAuthCallbackSchema>;

const UnipileCalendarAttendeeSchema = z.looseObject({
  email: z.string().nullish(),
  display_name: z.string().nullish(),
  response_status: z.string().nullish(),
  is_organizer: z.boolean().nullish(),
});
export type UnipileCalendarAttendee = z.infer<typeof UnipileCalendarAttendeeSchema>;

const UnipileCalendarTimeSchema = z.looseObject({
  date_time: z.string().nullish(),
  time_zone: z.string().nullish(),
  date: z.string().nullish(),
});

const UnipilePresentCalendarTimeSchema = UnipileCalendarTimeSchema.superRefine((time, ctx) => {
  if (!time.date_time && !time.date) ctx.addIssue({ code: "custom", message: "start requires date_time or date" });
});

const UnipileCalendarEventFields = {
  title: z.string().nullish(),
  body: z.string().nullish(),
  location: z.string().nullish(),
  is_cancelled: z.boolean().nullish(),
  is_all_day: z.boolean().nullish(),
  start: UnipileCalendarTimeSchema.nullish(),
  end: UnipileCalendarTimeSchema.nullish(),
  attendees: z.array(UnipileCalendarAttendeeSchema).nullish(),
  organizer: UnipileCalendarAttendeeSchema.nullish(),
  conference: z
    .looseObject({
      provider: z.string().nullish(),
      conference_id: z.string().nullish(),
      url: z.string().nullish(),
    })
    .nullish(),
  recurrence: z
    .union([z.string(), z.array(z.string())])
    .nullish()
    .transform((value) => {
      if (Array.isArray(value)) return value.length ? value.join("\n") : null;
      return value ?? null;
    }),
  visibility: z.string().nullish(),
} as const;

export const UnipileCalendarEventSchema = z.looseObject({
  id: z.string(),
  ...UnipileCalendarEventFields,
});
export type UnipileCalendarEvent = z.infer<typeof UnipileCalendarEventSchema>;

export const UnipileCalendarSchema = z.looseObject({
  id: z.string(),
  name: z.string().nullish(),
  description: z.string().nullish(),
  background_color: z.string().nullish(),
  timezone: z.string().nullish(),
});

const UnipileCalendarWebhookFields = {
  account_id: z.string(),
  calendar_id: z.string().nullish(),
  id: z.string().nullish(),
  ...UnipileCalendarEventFields,
} as const;

export const UnipileCalendarWebhookSchema = z.discriminatedUnion("event", [
  z.looseObject({
    event: z.literal("calendar_event_created"),
    ...UnipileCalendarWebhookFields,
    id: z.string().min(1),
    calendar_id: z.string().min(1),
    start: UnipilePresentCalendarTimeSchema,
  }),
  z.looseObject({
    event: z.literal("calendar_event_updated"),
    ...UnipileCalendarWebhookFields,
    id: z.string().min(1),
    calendar_id: z.string().min(1),
    start: UnipilePresentCalendarTimeSchema,
  }),
  z.looseObject({
    event: z.literal("calendar_event_deleted"),
    ...UnipileCalendarWebhookFields,
    id: z.string().min(1),
  }),
]);
export type UnipileCalendarWebhook = z.infer<typeof UnipileCalendarWebhookSchema>;
