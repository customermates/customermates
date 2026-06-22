import { z } from "zod";

import { encodeToToon, validationError, formatDatesInResponse, mcpPage, mcpPageSize } from "./utils";

import { GetQueryParamsSchema } from "@/core/base/base-get.schema";
import { ActivitiesParamsSchema } from "@/ee/messaging/activities/activities.schema";
import { SendEmailSchema } from "@/ee/messaging/outbound/send-email.interactor";
import { SendChatMessageSchema } from "@/ee/messaging/outbound/send-chat-message.interactor";
import { StartChatInputSchema } from "@/ee/messaging/outbound/start-chat.interactor";
import {
  getGetMyConnectedAccountsInteractor,
  getGetMessagingThreadsInteractor,
  getGetMessagingThreadInteractor,
  getGetActivitiesInteractor,
  getSendEmailInteractor,
  getSendChatMessageInteractor,
  getStartChatInteractor,
} from "@/core/di";

const ListPaginationSchema = z.object({
  page: mcpPage(),
  pageSize: mcpPageSize(25, "Results per page: 5, 10, 25, or 100 (default 25)"),
  searchTerm: z.string().optional().describe("Free-text search against thread name, subject, and participants"),
});

const ThreadIdSchema = z.object({ threadId: z.uuid().describe("Thread id (from get_messaging_threads)") });

function projectThread(thread: any) {
  return {
    id: thread.id,
    connectedAccountId: thread.connectedAccountId,
    provider: thread.provider,
    type: thread.type,
    name: thread.name,
    subject: thread.subject,
    preview: thread.preview,
    state: thread.state,
    lastMessageAt: thread.lastMessageAt,
    participants: thread.participants?.length ?? 0,
    sharedToCrm: thread.sharedToCrm,
    isOwner: thread.isOwner,
  };
}

function projectMessage(message: any) {
  return {
    id: message.id,
    direction: message.direction,
    origin: message.origin,
    sender: message.sender?.displayName ?? message.sender?.identifier ?? null,
    subject: message.subject,
    bodyText: message.bodyText,
    attachments: (message.attachmentsMeta ?? []).map((attachment: any) => ({
      name: attachment.fileName ?? attachment.name,
      type: attachment.type,
      mime: attachment.mime,
    })),
    sentAt: message.sentAt,
    editedAt: message.editedAt,
  };
}

export const listConnectedAccountsTool = {
  name: "list_connected_accounts",
  description:
    "List the messaging accounts (email, LinkedIn, WhatsApp, …) connected to the workspace and visible to you. " +
    "Returns per account { id, provider, status, emailAddress, displayName, shared, isOwner, lastSyncedAt }. " +
    "Use the id as connectedAccountId/accountId for send_email, start_chat, etc.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: z.object({}),
  execute: async () => {
    const result = await getGetMyConnectedAccountsInteractor().invoke();
    if (!result.ok) return validationError(result.error);
    return encodeToToon(formatDatesInResponse({ items: result.data }));
  },
};

export const getMessagingThreadsTool = {
  name: "get_messaging_threads",
  description:
    "List inbox message threads across connected accounts. " +
    "Optional: page, pageSize (max 100, default 25), searchTerm. " +
    "Returns id + name/subject/preview + state + lastMessageAt + participant count per thread (not message bodies). " +
    "Use get_messaging_thread for the full conversation.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: ListPaginationSchema,
  execute: async ({ page, pageSize, searchTerm }: z.infer<typeof ListPaginationSchema>) => {
    const result = await getGetMessagingThreadsInteractor().invoke(
      GetQueryParamsSchema.parse({ searchTerm, pagination: { page, pageSize } }),
    );
    if (!result.ok) return validationError(result.error);
    return encodeToToon(
      formatDatesInResponse({
        items: result.data.items.map(projectThread),
        total: result.data.pagination?.total ?? result.data.items.length,
        page,
      }),
    );
  },
};

export const getMessagingThreadTool = {
  name: "get_messaging_thread",
  description:
    "Fetch one message thread with its full message list. " +
    "Required: threadId (from get_messaging_threads). " +
    "Returns the thread plus each message's direction, sender, subject, text body, and attachment metadata (HTML bodies and raw attachment urls are omitted).",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: ThreadIdSchema,
  execute: async (params: z.infer<typeof ThreadIdSchema>) => {
    const result = await getGetMessagingThreadInteractor().invoke(params);
    if (!result.ok) return validationError(result.error);
    return encodeToToon(
      formatDatesInResponse({
        thread: projectThread(result.data.thread),
        messages: result.data.messages.map(projectMessage),
      }),
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
});

export const getActivitiesTool = {
  name: "get_activities",
  description:
    "List the activity timeline (messages, audit-log changes, calendar events) for the workspace or one record. " +
    "Optional: page, pageSize, entityType + entityId to scope to a single contact/organization/deal/service/task. " +
    "Returns time-ordered entries by kind (message | audit | activity | calendar_event).",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: GetActivitiesSchema,
  execute: async ({ page, pageSize, entityType, entityId }: z.infer<typeof GetActivitiesSchema>) => {
    const result = await getGetActivitiesInteractor().invoke(
      ActivitiesParamsSchema.parse({ pagination: { page, pageSize }, entityType, entityId }),
    );
    if (!result.ok) return validationError(result.error);
    return encodeToToon(
      formatDatesInResponse({
        items: result.data.items,
        total: result.data.pagination?.total ?? result.data.items.length,
        page,
      }),
    );
  },
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
  execute: async (params: z.infer<typeof SendEmailSchema>) => {
    const result = await getSendEmailInteractor().invoke(params);
    if (!result.ok) return validationError(result.error);
    return params.threadId ? `Reply sent in thread ${params.threadId}` : "Email sent";
  },
};

export const sendChatMessageTool = {
  name: "send_chat_message",
  description:
    "Send a real message into an existing chat thread (LinkedIn/WhatsApp/etc.). SIDE EFFECT: delivers a real message. " +
    "Required: threadId, text.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  inputSchema: SendChatMessageSchema,
  execute: async (params: z.infer<typeof SendChatMessageSchema>) => {
    const result = await getSendChatMessageInteractor().invoke(params);
    if (!result.ok) return validationError(result.error);
    return `Message sent in thread ${params.threadId}`;
  },
};

export const startChatTool = {
  name: "start_chat",
  description:
    "Start a new chat/conversation with one or more attendees. SIDE EFFECT: delivers a real message. " +
    "Required: connectedAccountId, attendeeIdentifiers, text. Optional: subject. " +
    "attendeeIdentifiers are the recipients' provider handles/usernames (the value of a contact's messaging channel).",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  inputSchema: StartChatInputSchema,
  execute: async (params: z.infer<typeof StartChatInputSchema>) => {
    const result = await getStartChatInteractor().invoke(params);
    if (!result.ok) return validationError(result.error);
    return "Chat started";
  },
};
