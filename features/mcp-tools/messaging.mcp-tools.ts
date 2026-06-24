import { z } from "zod";

import {
  encodeToToon,
  runInteractor,
  formatDatesInResponse,
  mcpPage,
  mcpPageSize,
  filtersDescription,
  sortDescription,
} from "./utils";

import { GetQueryParamsSchema, FilterSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { filterFieldsHint } from "@/core/types/filter-field-value-kind";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { ActivitiesParamsSchema } from "@/ee/messaging/activities/activities.schema";
import { SendEmailSchema } from "@/ee/messaging/outbound/send-email.interactor";
import { SendChatMessageSchema } from "@/ee/messaging/outbound/send-chat-message.interactor";
import { StartChatInputSchema } from "@/ee/messaging/outbound/start-chat.interactor";
import {
  getGetMyConnectedAccountsInteractor,
  getGetMessagingThreadsApiInteractor,
  getGetMessagingThreadInteractor,
  getGetActivitiesApiInteractor,
  getSendEmailInteractor,
  getSendChatMessageInteractor,
  getStartChatInteractor,
} from "@/core/di";

const ListPaginationSchema = z.object({
  page: mcpPage(),
  pageSize: mcpPageSize(25, "Results per page: 5, 10, 25, or 100 (default 25)"),
  searchTerm: z.string().optional().describe("Free-text search against thread name, subject, and participants"),
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

const ThreadIdSchema = z.object({
  threadId: z.uuid().describe("Thread id (from get_messaging_threads)"),
  page: mcpPage(),
  pageSize: mcpPageSize(25, "Messages per page: 5, 10, 25, or 100 (default 25). Page 1 is the most recent messages."),
});

const LIST_PARTICIPANT_LIMIT = 50;

export const listConnectedAccountsTool = {
  name: "list_connected_accounts",
  description:
    "List the messaging accounts (email, LinkedIn, WhatsApp, …) connected to the workspace and visible to you. " +
    "Returns per account { id, provider, status, emailAddress, displayName, shared, isOwner, lastSyncedAt }. " +
    "Use the id as connectedAccountId/accountId for send_email, start_chat, etc.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: z.object({}),
  execute: () =>
    runInteractor(getGetMyConnectedAccountsInteractor().invoke(), (data) =>
      encodeToToon(formatDatesInResponse({ items: data })),
    ),
};

export const getMessagingThreadsTool = {
  name: "get_messaging_threads",
  description:
    "List inbox message threads across connected accounts. " +
    "Optional: page, pageSize (max 100, default 25), searchTerm, filters, sortDescriptor. " +
    "Returns per thread: id, name/subject/preview, state, lastMessageAt, participantCount, and a participants list " +
    "(displayName, identifier, channel provider, isSelf, isLinked, and the linked CRM contact {id,name} when linked) — capped at 50 per thread. " +
    "A participant with isLinked=false is someone in the conversation who is NOT yet a CRM contact; filter `participants` with the `hasUnset` operator to find threads that have such people. " +
    "Message bodies are omitted here — use get_messaging_thread for the conversation.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: ListPaginationSchema,
  execute: ({ page, pageSize, searchTerm, filters, sortDescriptor }: z.infer<typeof ListPaginationSchema>) =>
    runInteractor(
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
    ),
};

export const getMessagingThreadTool = {
  name: "get_messaging_thread",
  description:
    "Fetch one message thread: its full participant list plus a page of messages. " +
    "Required: threadId (from get_messaging_threads). Optional: page, pageSize (5/10/25/100, default 25). " +
    "Page 1 returns the most recent messages (chronological within the page); higher pages fetch older messages. " +
    "Returns the thread (with the full participants array — displayName, identifier, channel, isSelf, isLinked, linked CRM contact), the messages (direction, sender, subject, text body, attachment metadata; HTML bodies and raw attachment urls omitted), and total (message count in the thread).",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: ThreadIdSchema,
  execute: (params: z.infer<typeof ThreadIdSchema>) =>
    runInteractor(getGetMessagingThreadInteractor().invoke(params), (data) =>
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
            attachments: message.attachmentsMeta.map((attachment) => ({
              name: attachment.fileName ?? attachment.name,
              type: attachment.type,
              mime: attachment.mime,
            })),
            sentAt: message.sentAt,
            editedAt: message.editedAt,
          })),
          total: data.total,
          page: params.page,
        }),
      ),
    ),
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
  description:
    "List the activity timeline (messages, audit-log changes, calendar events) for the workspace or one record. " +
    "Optional: page, pageSize, entityType + entityId (scope to one record), filters, sortDescriptor. " +
    "Returns time-ordered entries by kind (message | audit | activity | calendar_event).",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
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

export const sendEmailTool = {
  name: "send_email",
  description:
    "Send a real email (or reply) from a connected email account. SIDE EFFECT: delivers a real message. " +
    "Required: to, subject, body, and at least one of threadId (reply; takes precedence if both given) or connectedAccountId (new email). " +
    "Optional: cc, bcc. cc/bcc are plain email strings (not the {identifier} object form used by to). " +
    "Get account/thread ids from list_connected_accounts / get_messaging_threads.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  inputSchema: SendEmailSchema,
  execute: (params: z.infer<typeof SendEmailSchema>) =>
    runInteractor(getSendEmailInteractor().invoke(params), () =>
      params.threadId ? `Reply sent in thread ${params.threadId}` : "Email sent",
    ),
};

export const sendChatMessageTool = {
  name: "send_chat_message",
  description:
    "Send a real message into an existing chat thread (LinkedIn/WhatsApp/etc.). SIDE EFFECT: delivers a real message. " +
    "Required: threadId, text.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  inputSchema: SendChatMessageSchema,
  execute: (params: z.infer<typeof SendChatMessageSchema>) =>
    runInteractor(getSendChatMessageInteractor().invoke(params), () => `Message sent in thread ${params.threadId}`),
};

export const startChatTool = {
  name: "start_chat",
  description:
    "Start a new chat/conversation with one or more attendees. SIDE EFFECT: delivers a real message. " +
    "Required: connectedAccountId, attendeeIdentifiers, text. Optional: subject. " +
    "attendeeIdentifiers are the recipients' provider handles/usernames (the value of a contact's messaging channel).",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  inputSchema: StartChatInputSchema,
  execute: (params: z.infer<typeof StartChatInputSchema>) =>
    runInteractor(getStartChatInteractor().invoke(params), () => "Chat started"),
};
