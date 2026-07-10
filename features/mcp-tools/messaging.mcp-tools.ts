import { z } from "zod";

import {
  encodeToToon,
  runInteractor,
  validationError,
  customErrorMessage,
  formatDatesInResponse,
  mcpPage,
  mcpPageSize,
  filtersDescription,
  sortDescription,
} from "./utils";

import { CustomErrorCode } from "@/core/validation/validation.types";

import { GetQueryParamsSchema, FilterSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { filterFieldsHint } from "@/core/types/filter-field-value-kind";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { isRedirect } from "@/features/auth/auth-outcome";
import { CONNECT_CHANNEL_KEYS } from "@/ee/messaging/connect/connect-channels";
import { ActivitiesParamsSchema } from "@/ee/messaging/activities/activities.schema";
import { SendEmailSchema } from "@/ee/messaging/outbound/send-email.interactor";
import { BaseSendChatMessageSchema } from "@/ee/messaging/outbound/send-chat-message.interactor";
import { BaseStartChatInputSchema, StartChatInputSchema } from "@/ee/messaging/outbound/start-chat.interactor";
import { SaveDraftSchema } from "@/ee/messaging/outbound/save-draft.interactor";
import { DiscardDraftSchema } from "@/ee/messaging/outbound/discard-draft.interactor";
import { UpdateThreadSchema } from "@/ee/messaging/thread-state/update-thread.interactor";
import {
  getGetMessagingThreadsApiInteractor,
  getGetMessagingThreadInteractor,
  getGetActivitiesApiInteractor,
  getGetCalendarsApiInteractor,
  getGetCalendarEventsApiInteractor,
  getGetCalendarEventByIdInteractor,
  getSendEmailInteractor,
  getSendChatMessageInteractor,
  getStartChatInteractor,
  getSaveDraftInteractor,
  getDiscardDraftInteractor,
  getUpdateThreadInteractor,
  getCreateAuthLinkInteractor,
} from "@/core/di";

const GetMessagingThreadsSchema = z.object({
  threadId: z
    .uuid()
    .optional()
    .describe("Thread id from a previous list call. When set, returns that thread's detail instead of the list"),
  page: mcpPage(),
  pageSize: mcpPageSize(
    25,
    "Results per page: 5, 10, 25, or 100 (default 25). With threadId set this pages the thread's messages",
  ),
  searchTerm: z
    .string()
    .optional()
    .describe("Free-text search against thread name, subject, and participants (list mode only)"),
  filters: z
    .array(FilterSchema)
    .optional()
    .describe(
      filtersDescription(
        filterFieldsHint([
          FilterFieldKey.state,
          FilterFieldKey.provider,
          FilterFieldKey.participantContactId,
          FilterFieldKey.participants,
        ]),
      ),
    ),
  sortDescriptor: SortDescriptorSchema.optional().describe(sortDescription("lastMessageAt")),
});

const LIST_PARTICIPANT_LIMIT = 50;

export const getMessagingThreadsTool = {
  name: "get_messaging_threads",
  title: "Get messaging threads",
  description:
    "Use this when reading the inbox: without threadId lists message threads across connected accounts; with threadId returns that thread's detail (full participants plus a page of messages, drafts flagged isDraft, page 1 is the most recent). " +
    "List rows carry id, name/subject/preview, state, lastMessageAt, and participants (displayName, identifier, provider, isSelf, isLinked, linked CRM contact) capped at 50; message bodies appear only in detail mode. " +
    "List mode omits threads that have no messages yet (unless they hold a draft); detail by threadId returns any thread. " +
    "A participant with isLinked=false is NOT yet a CRM contact; filter `participants` with the `hasUnset` operator to find threads that have such people.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: GetMessagingThreadsSchema,
  execute: (params: z.infer<typeof GetMessagingThreadsSchema>) => {
    const { threadId, page, pageSize, searchTerm, filters, sortDescriptor } = params;
    if (threadId) {
      return runInteractor(getGetMessagingThreadInteractor().invoke({ threadId, page, pageSize }), (data) =>
        encodeToToon(
          formatDatesInResponse({
            thread: {
              id: data.thread.id,
              connectedAccountId: data.thread.connectedAccountId,
              provider: data.thread.provider,
              type: data.thread.type,
              name: data.thread.name,
              subject: data.thread.subject,
              preview: data.thread.preview,
              state: data.thread.state,
              lastMessageAt: data.thread.lastMessageAt,
              participantCount: data.thread.participants.length,
              participants: data.thread.participants.map((p) => ({
                displayName: p.displayName,
                identifier: p.identifier,
                provider: data.thread.provider,
                isSelf: p.isSelf ?? false,
                isLinked: p.contact != null,
                contact: p.contact
                  ? { id: p.contact.id, name: `${p.contact.firstName} ${p.contact.lastName}`.trim() || null }
                  : null,
              })),
              sharedToCrm: data.thread.sharedToCrm,
              isOwner: data.thread.isOwner,
            },
            messages: data.messages.map((message) => ({
              id: message.id,
              direction: message.direction,
              sender: message.sender?.displayName ?? message.sender?.identifier ?? null,
              subject: message.subject,
              bodyText: message.bodyText,
              isDraft: message.isDraft,
              attachments: message.attachmentsMeta.map((attachment) => ({
                name: attachment.fileName ?? attachment.name,
                type: attachment.type,
                mime: attachment.mime,
              })),
              sentAt: message.sentAt,
              editedAt: message.editedAt,
            })),
            total: data.total,
            page,
          }),
        ),
      );
    }
    return runInteractor(
      getGetMessagingThreadsApiInteractor().invoke(
        GetQueryParamsSchema.parse({ searchTerm, filters, sortDescriptor, pagination: { page, pageSize } }),
      ),
      (data) =>
        encodeToToon(
          formatDatesInResponse({
            items: data.items.map((thread) => ({
              id: thread.id,
              connectedAccountId: thread.connectedAccountId,
              provider: thread.provider,
              type: thread.type,
              name: thread.name,
              subject: thread.subject,
              preview: thread.preview,
              state: thread.state,
              lastMessageAt: thread.lastMessageAt,
              participantCount: thread.participants.length,
              participants: thread.participants.slice(0, LIST_PARTICIPANT_LIMIT).map((p) => ({
                displayName: p.displayName,
                identifier: p.identifier,
                provider: thread.provider,
                isSelf: p.isSelf ?? false,
                isLinked: p.contact != null,
                contact: p.contact
                  ? { id: p.contact.id, name: `${p.contact.firstName} ${p.contact.lastName}`.trim() || null }
                  : null,
              })),
              sharedToCrm: thread.sharedToCrm,
              isOwner: thread.isOwner,
            })),
            total: data.pagination?.total ?? data.items.length,
            page,
          }),
        ),
    );
  },
};

const GetActivitiesSchema = z.object({
  page: mcpPage(),
  pageSize: mcpPageSize(25, "Results per page: 5, 10, 25, or 100 (default 25)"),
  entityType: z
    .enum(["contact", "organization", "deal", "service", "task"])
    .optional()
    .describe("Scope activities to one entity type (must be paired with entityId)"),
  entityId: z.uuid().optional().describe("Scope activities to one record (must be paired with entityType)"),
  filters: z
    .array(FilterSchema)
    .optional()
    .describe(
      filtersDescription(
        filterFieldsHint([FilterFieldKey.timelineKind, FilterFieldKey.timelineThreadId, FilterFieldKey.provider]),
      ),
    ),
  sortDescriptor: SortDescriptorSchema.optional().describe(sortDescription("at (the event time)")),
});

export const getActivitiesTool = {
  name: "get_activities",
  title: "Get activities",
  description:
    "List the activity timeline (messages, audit-log changes, calendar events) for the workspace or one record. " +
    "Optional: page, pageSize, entityType + entityId (scope to one record), filters, sortDescriptor. " +
    "Returns time-ordered entries by kind (message | audit | activity | calendar_event).",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: GetActivitiesSchema,
  execute: ({ page, pageSize, entityType, entityId, filters, sortDescriptor }: z.infer<typeof GetActivitiesSchema>) =>
    runInteractor(
      getGetActivitiesApiInteractor().invoke(
        ActivitiesParamsSchema.parse({ pagination: { page, pageSize }, entityType, entityId, filters, sortDescriptor }),
      ),
      (data) =>
        encodeToToon(
          formatDatesInResponse({
            items: data.items,
            total: data.pagination?.total ?? data.items.length,
            page,
          }),
        ),
    ),
};

const GetCalendarsToolSchema = z.object({
  list: z
    .enum(["calendars", "events"])
    .default("calendars")
    .describe("Which collection to list: calendars (default) or calendar events. Ignored when eventId is set"),
  eventId: z
    .uuid()
    .optional()
    .describe(
      "Calendar event id (the entityId of a messaging.calendar.event.changed webhook event). When set, returns that event's detail",
    ),
  searchTerm: z.string().optional().describe("Free-text search against the calendar name or event title"),
  filters: z
    .array(FilterSchema)
    .optional()
    .describe(
      filtersDescription(
        `for calendars ${filterFieldsHint([FilterFieldKey.connectedAccountId])}; for events ${filterFieldsHint([FilterFieldKey.calendarId, FilterFieldKey.connectedAccountId, FilterFieldKey.startsAt])}`,
      ),
    ),
  sortDescriptor: SortDescriptorSchema.optional().describe(sortDescription("name (calendars) or startsAt (events)")),
  page: mcpPage(),
  pageSize: mcpPageSize(25, "Results per page: 5, 10, 25, or 100 (default 25)"),
});

export const getCalendarsTool = {
  name: "get_calendars",
  title: "Get calendars and events",
  description:
    'Reads synced calendars of connected accounts. list: "calendars" returns the accessible calendars (ids match the entityId of messaging.calendar.changed webhook events); list: "events" returns calendar events ordered by start time (filter by calendarId or a startsAt range for agenda windows). ' +
    "With eventId set, returns that event's detail including organizer and attendees (ids match the entityId of messaging.calendar.event.changed webhook events). " +
    "Optional: searchTerm, filters, sortDescriptor, page, pageSize.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: GetCalendarsToolSchema,
  execute: async ({
    list,
    eventId,
    searchTerm,
    filters,
    sortDescriptor,
    page,
    pageSize,
  }: z.infer<typeof GetCalendarsToolSchema>) => {
    if (eventId) {
      const result = await getGetCalendarEventByIdInteractor().invoke({ id: eventId });
      if (!result.ok) return validationError(result.error);
      if (!result.data) return customErrorMessage(CustomErrorCode.calendarEventNotFound);

      return encodeToToon(formatDatesInResponse(result.data));
    }

    const params = GetQueryParamsSchema.parse({ searchTerm, filters, sortDescriptor, pagination: { page, pageSize } });

    if (list === "events") {
      return runInteractor(getGetCalendarEventsApiInteractor().invoke(params), (data) =>
        encodeToToon(
          formatDatesInResponse({
            items: data.items,
            total: data.pagination?.total ?? data.items.length,
            page,
          }),
        ),
      );
    }

    return runInteractor(getGetCalendarsApiInteractor().invoke(params), (data) =>
      encodeToToon(
        formatDatesInResponse({
          items: data.items,
          total: data.pagination?.total ?? data.items.length,
          page,
        }),
      ),
    );
  },
};

const SendChatMessageToolSchema = BaseSendChatMessageSchema.omit({ attachments: true })
  .partial({ threadId: true })
  .extend(
    BaseStartChatInputSchema.omit({ text: true, attachments: true }).partial({
      connectedAccountId: true,
      attendeeIdentifiers: true,
    }).shape,
  );

export const sendChatMessageTool = {
  name: "send_chat_message",
  title: "Send chat message",
  description:
    "Use this when sending a real chat message (LinkedIn, WhatsApp, and other connected chat accounts). SIDE EFFECT: delivers a real message. " +
    "Exactly one mode: pass threadId to send text into that existing thread (optional draftMessageId converts a saved draft on send), " +
    "or omit threadId to start a new chat, which requires connectedAccountId (see get_workspace_context) and attendeeIdentifiers " +
    "(the recipients' provider handles, i.e. the value of a contact's messaging channel) plus optional chatName to name the group. " +
    "New LinkedIn chats default to the Classic product; set linkedinProduct to sales_navigator or recruiter to send an InMail from that product's inbox " +
    "(requires inmailSubject; recruiter also inmailSignature), or set inmail true on classic to InMail someone outside the network. " +
    "Only use a linkedinProduct listed in the account's linkedinProducts from get_workspace_context; an unavailable product is rejected. " +
    "An identical text sent into the same thread within about a minute is rejected as a duplicate. " +
    "For email use send_email.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  inputSchema: SendChatMessageToolSchema,
  execute: async (params: z.infer<typeof SendChatMessageToolSchema>) => {
    const { threadId } = params;
    if (threadId) {
      return runInteractor(
        getSendChatMessageInteractor().invoke({ ...params, threadId }),
        () => `Message sent in thread ${threadId}`,
      );
    }
    const startChat = StartChatInputSchema.safeParse(params);
    if (!startChat.success) return validationError(startChat.error);
    return runInteractor(getStartChatInteractor().invoke(startChat.data), (data) =>
      data.threadId ? `Chat started, thread ${data.threadId}` : "Chat started",
    );
  },
};

export const sendEmailTool = {
  name: "send_email",
  title: "Send email",
  description:
    "Send a real email (or reply) from a connected email account. SIDE EFFECT: delivers a real message. " +
    "Required: to, subject, body, and at least one of threadId (reply; takes precedence if both given) or connectedAccountId (new email). " +
    "Optional: cc, bcc. cc/bcc are plain email strings (not the {identifier} object form used by to). " +
    "When replying into a thread, an identical body sent to that thread within about a minute is rejected as a duplicate. " +
    "Get account ids from get_workspace_context and thread ids from get_messaging_threads.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  inputSchema: SendEmailSchema,
  execute: (params: z.infer<typeof SendEmailSchema>) =>
    runInteractor(getSendEmailInteractor().invoke(params), (data) => {
      if (params.threadId) return `Reply sent in thread ${params.threadId}`;
      return data?.messagingThreadId ? `Email sent, thread ${data.messagingThreadId}` : "Email sent";
    }),
};

export const saveMessageDraftTool = {
  name: "save_message_draft",
  title: "Save message draft",
  description:
    "Use this when the user wants a reply prepared for review: the draft appears in their inbox compose box and they send it themselves. " +
    "Drafts require an existing thread; there is no draft for a brand-new outbound email. " +
    "send_email and send_chat_message deliver immediately, never use them when asked to draft. " +
    "A thread has at most one draft, saving again replaces it. subject, cc, and bcc apply to email threads only. " +
    "Returns the draft message id and its thread id.",
  annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: SaveDraftSchema,
  execute: (params: z.infer<typeof SaveDraftSchema>) =>
    runInteractor(getSaveDraftInteractor().invoke(params), (data) =>
      encodeToToon({ draftMessageId: data.id, threadId: data.messagingThreadId }),
    ),
};

export const discardMessageDraftTool = {
  name: "discard_message_draft",
  title: "Discard message draft",
  description:
    "Use this when a prepared draft is no longer wanted: permanently deletes it. " +
    "messageId is a DRAFT message id, taken from save_message_draft's response or from the thread detail of " +
    "get_messaging_threads (messages flagged isDraft). Only drafts can be discarded; sent and received messages are never affected. " +
    "Discarding an id that is not a draft is a safe no-op that reports no draft found.",
  annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: true, openWorldHint: false },
  inputSchema: DiscardDraftSchema,
  execute: (params: z.infer<typeof DiscardDraftSchema>) =>
    runInteractor(getDiscardDraftInteractor().invoke(params), (data) =>
      data.threadId ? `Draft discarded from thread ${data.threadId}` : "No draft found for that message id",
    ),
};

const UpdateMessagingThreadSchema = UpdateThreadSchema.pick({ threadId: true, state: true }).required({ state: true });

export const updateMessagingThreadTool = {
  name: "update_messaging_thread",
  title: "Update messaging thread",
  description:
    "Use this when triaging the inbox: sets a thread's state. state is one of unread, open, closed, or spam. " +
    "threadId comes from get_messaging_threads. Setting the state a thread already has is a harmless no-op.",
  annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: UpdateMessagingThreadSchema,
  execute: (params: z.infer<typeof UpdateMessagingThreadSchema>) =>
    runInteractor(getUpdateThreadInteractor().invoke(params), () => `Thread ${params.threadId} set to ${params.state}`),
};

const ConnectMessagingAccountSchema = z.object({
  channel: z
    .enum(CONNECT_CHANNEL_KEYS)
    .describe(
      "Which channel to connect: google (Gmail), outlook, imap (any other email via IMAP/SMTP), whatsapp, " +
        "linkedin (Classic), linkedin_sales_navigator, linkedin_recruiter, instagram, telegram.",
    ),
});

export const connectMessagingAccountTool = {
  name: "connect_messaging_account",
  title: "Connect messaging account",
  description:
    "Generate a secure link the user opens in a browser to connect a messaging channel to their inbox. " +
    "You cannot complete the connection yourself: return the link and tell the user to open it and finish auth there " +
    "(scan a QR code for WhatsApp, sign in for email or LinkedIn). The link is single-user and expires in 30 minutes. " +
    "channel is one of google (Gmail), outlook, imap, whatsapp, linkedin, linkedin_sales_navigator, linkedin_recruiter, instagram, telegram. " +
    "Requires a paid subscription and fewer than 5 connected channels. " +
    "Call get_workspace_context first to see which accounts are already connected. Returns the connect url.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  inputSchema: ConnectMessagingAccountSchema,
  execute: async (params: z.infer<typeof ConnectMessagingAccountSchema>) => {
    const result = await getCreateAuthLinkInteractor().invoke(params);
    return isRedirect(result) ? encodeToToon({ url: result.redirect }) : validationError(result.error);
  },
};
