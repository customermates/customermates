import { z } from "zod";

const UnipileUserSpecificsSchema = z.looseObject({
  headline: z.string().nullish(),
  occupation: z.string().nullish(),
  industry: z.string().nullish(),
  location: z.string().nullish(),
  network_distance: z.string().nullish(),
  phone_number: z.string().nullish(),
});

export const UnipileUserSchema = z.looseObject({
  id: z.string(),
  object: z.enum(["User", "UserProfile"]).nullish(),
  type: z.enum(["individual", "organization", "other"]).nullish(),
  public_identifier: z.string().nullish(),
  display_name: z.string().nullish(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  profile_url: z.string().nullish(),
  public_picture_url: z.string().nullish(),
  private_picture_download_url: z.string().nullish(),
  description: z.string().nullish(),
  specifics: UnipileUserSpecificsSchema.nullish(),
});
export type UnipileUser = z.infer<typeof UnipileUserSchema>;

export const UnipileGroupParticipantSchema = z.looseObject({
  object: z.literal("GroupParticipant").nullish(),
  is_self: z.boolean().nullish(),
  is_admin: z.boolean().nullish(),
  user: UnipileUserSchema,
});
export type UnipileGroupParticipant = z.infer<typeof UnipileGroupParticipantSchema>;

export const UnipileAttachmentSchema = z.looseObject({
  object: z.literal("Attachment").nullish(),
  id: z.string().nullish(),
  type: z.string().nullish(),
  mimetype: z.string().nullish(),
  url: z.string().nullish(),
  file_size: z.number().nullish(),
  is_unavailable: z.boolean().nullish(),
  duration: z.number().nullish(),
  voice_note: z.boolean().nullish(),
  sticker: z.boolean().nullish(),
  gif: z.boolean().nullish(),
  filename: z.string().nullish(),
  size: z
    .looseObject({
      height: z.union([z.string(), z.number()]).nullish(),
      width: z.union([z.string(), z.number()]).nullish(),
    })
    .nullish(),
  media_type: z.string().nullish(),
});
export type UnipileAttachment = z.infer<typeof UnipileAttachmentSchema>;

const UnipileProviderSchema = z.enum([
  "mock",
  "whatsapp",
  "linkedin",
  "google",
  "outlook",
  "imap",
  "telegram",
  "instagram",
]);

export const UnipileChatSchema = z.looseObject({
  object: z.literal("Chat").nullish(),
  id: z.string(),
  name: z.string().nullish(),
  description: z.string().nullish(),
  is_group: z.boolean().nullish(),
  is_channel: z.boolean().nullish(),
  user: UnipileUserSchema.nullish(),
  user_id: z.string().nullish(),
  participants: z.array(UnipileGroupParticipantSchema).nullish(),
  participants_count: z.number().nullish(),
  image_url: z.string().nullish(),
  last_message: z
    .looseObject({
      text: z.string().nullish(),
      sender_display_name: z.string().nullish(),
      is_sender: z.boolean().nullish(),
    })
    .nullish(),
  unread_count: z.number().nullish(),
  folders: z.array(z.string()).nullish(),
  is_archived: z.boolean().nullish(),
  provider: UnipileProviderSchema.nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  last_message_timestamp: z.string().nullish(),
});
export type UnipileChat = z.infer<typeof UnipileChatSchema>;

export const UnipileMessageSchema = z.looseObject({
  object: z.literal("Message").nullish(),
  id: z.string(),
  text: z.string().nullish(),
  sender_id: z.string().nullish(),
  sender: UnipileUserSchema.nullish(),
  chat_id: z.string().nullish(),
  timestamp: z.string(),
  is_sender: z.boolean().nullish(),
  is_hidden: z.boolean().nullish(),
  is_seen: z.boolean().nullish(),
  is_delivered: z.boolean().nullish(),
  is_deleted: z.boolean().nullish(),
  is_edited: z.boolean().nullish(),
  is_pinned: z.boolean().nullish(),
  is_event: z.boolean().nullish(),
  is_mentionned: z.boolean().nullish(),
  event_type: z.number().nullish(),
  event_metadata: z.looseObject({}).nullish(),
  reactions_counter: z.array(z.looseObject({ reaction: z.string().nullish(), count: z.number().nullish() })).nullish(),
  attachments: z.array(UnipileAttachmentSchema).nullish(),
  quoted: z.looseObject({}).nullish(),
  forwarded: z.boolean().nullish(),
  specifics: z.looseObject({ subject: z.string().nullish() }).nullish(),
  provider: UnipileProviderSchema.nullish(),
});
export type UnipileMessage = z.infer<typeof UnipileMessageSchema>;

export const UnipileAccountSchema = z.looseObject({
  object: z.literal("Account").nullish(),
  id: z.string(),
  user_id: z.string().nullish(),
  name: z.string().nullish(),
  provider: z.string().nullish(),
  status: z.enum(["running", "errored", "disconnected", "degraded", "partial", "paused"]).nullish(),
  oauth_scope: z.union([z.string(), z.array(z.string())]).nullish(),
  metadata: z
    .looseObject({
      products_connection_status: z.record(z.string(), z.string()).nullish(),
      custom_data: z.unknown().nullish(),
    })
    .nullish(),
  initial_sync: z
    .looseObject({
      status: z.enum(["pending", "running", "failed", "completed"]).nullish(),
      started_at: z.string().nullish(),
    })
    .nullish(),
});
export type UnipileAccount = z.infer<typeof UnipileAccountSchema>;

const UnipileEmailAttendeeSchema = z.looseObject({
  email: z.string().nullish(),
  display_name: z.string().nullish(),
});

export const UnipileEmailSchema = z.looseObject({
  id: z.string(),
  message_id: z.string().nullish(),
  thread_id: z.string().nullish(),
  subject: z.string().nullish(),
  body: z.string().nullish(),
  snippet: z.string().nullish(),
  date: z.string(),
  folders: z.array(z.string()).nullish(),
  is_unread: z.boolean().nullish(),
  from: z.array(UnipileEmailAttendeeSchema).nullish(),
  to: z.array(UnipileEmailAttendeeSchema).nullish(),
  cc: z.array(UnipileEmailAttendeeSchema).nullish(),
  bcc: z.array(UnipileEmailAttendeeSchema).nullish(),
  reply_to: z.array(UnipileEmailAttendeeSchema).nullish(),
  attachments: z.array(UnipileAttachmentSchema).nullish(),
});
export type UnipileEmail = z.infer<typeof UnipileEmailSchema>;

const UnipileCalendarAttendeeSchema = z.looseObject({
  email: z.string().nullish(),
  display_name: z.string().nullish(),
  is_organizer: z.boolean().nullish(),
  is_optional: z.boolean().nullish(),
  type: z.enum(["required", "optional", "resource"]).nullish(),
  response_status: z.enum(["yes", "no", "maybe", "noreply"]).nullish(),
});

const UnipileCalendarTimeSchema = z.union([
  z.looseObject({
    type: z.literal("datetime"),
    date_time: z.string(),
    timezone: z.string().nullish(),
  }),
  z.looseObject({
    type: z.literal("date"),
    date: z.string(),
    timezone: z.string().nullish(),
  }),
]);

export const UnipileCalendarEventSchema = z.looseObject({
  object: z.literal("CalendarEvent").nullish(),
  id: z.string(),
  calendar_id: z.string().nullish(),
  title: z.string().nullish(),
  body: z.string().nullish(),
  location: z.string().nullish(),
  is_cancelled: z.boolean().nullish(),
  is_all_day: z.boolean().nullish(),
  attendees: z.array(UnipileCalendarAttendeeSchema).nullish(),
  start: UnipileCalendarTimeSchema.nullish(),
  end: UnipileCalendarTimeSchema.nullish(),
  recurrence: z.array(z.string()).nullish(),
  organizer: UnipileCalendarAttendeeSchema.nullish(),
  conference: z.looseObject({ provider: z.string().nullish(), url: z.string().nullish() }).nullish(),
  visibility: z.string().nullish(),
  transparency: z.string().nullish(),
  event_type: z.string().nullish(),
  timezone: z.string().nullish(),
});
export type UnipileCalendarEvent = z.infer<typeof UnipileCalendarEventSchema>;

export const UnipileCalendarSchema = z.looseObject({
  object: z.literal("Calendar").nullish(),
  id: z.string(),
  name: z.string().nullish(),
  description: z.string().nullish(),
  background_color: z.string().nullish(),
  color: z.string().nullish(),
  timezone: z.string().nullish(),
});
export type UnipileCalendar = z.infer<typeof UnipileCalendarSchema>;

export const UnipileInboxSchema = z.looseObject({
  id: z.string(),
  disabled: z.boolean().nullish(),
  description: z.string().nullish(),
});
export type UnipileInbox = z.infer<typeof UnipileInboxSchema>;

export const UnipileFolderSchema = z.looseObject({
  id: z.string(),
  role: z.string().nullish(),
  name: z.string().nullish(),
  total_count: z.number().nullish(),
  unread_count: z.number().nullish(),
});
export type UnipileFolder = z.infer<typeof UnipileFolderSchema>;

export const UnipileWebhookEnvelopeSchema = z.looseObject({
  type: z.string(),
  account_id: z.string().nullish(),
  webhook_id: z.string().nullish(),
  state: z.string().nullish(),
  payload: z.looseObject({}).nullish(),
});
export type UnipileWebhookEnvelope = z.infer<typeof UnipileWebhookEnvelopeSchema>;
