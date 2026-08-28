import { APP_LOCALES } from "@/i18n/locale-registry";

import { z } from "zod";

import { type Data } from "@/core/validation/validation.utils";

import type { AgentActivityDescriptor } from "./agent-activity";
import { AgentActivityDescriptorSchema, describeAgentTool } from "./agent-activity";
import { sanitizeAgentVisibleText, stripLegacyUserPageContextPrefix } from "./agent-output-safety";
import { internalToolIdentity } from "./tool-identity";

export const AgentPageContextSchema = z.object({
  route: z.string().max(500),
});

const [firstAppLocale, ...otherAppLocales] = APP_LOCALES;
const AgentAppLocaleSchema = z.enum([firstAppLocale, ...otherAppLocales]);

export const SendAgentMessageSchema = z.object({
  conversationId: z.uuid().optional(),
  clientRequestId: z.uuid(),
  text: z.string().min(1).max(20000),
  pageContext: AgentPageContextSchema.optional(),
  modelKey: z.string().min(1).max(50).optional(),
  locale: AgentAppLocaleSchema.optional(),
  retry: z.boolean().default(false),
});

export type SendAgentMessageData = Data<typeof SendAgentMessageSchema>;

export type AgentMessagePart =
  | { type: "text"; text: string }
  | {
      type: "activity";
      id: string;
      activity: AgentActivityDescriptor;
      status: "running" | "done" | "error" | "cancelled";
    }
  | {
      type: "approval";
      id: string;
      activity: AgentActivityDescriptor;
      status: "pending" | "approved" | "rejected" | "timeout" | "cancelled";
    };

const ACTIVITY_STATUSES = ["running", "done", "error", "cancelled"] as const;
const APPROVAL_STATUSES = ["pending", "approved", "rejected", "timeout", "cancelled"] as const;

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function clientSafeAgentMessageParts(
  value: unknown,
  options: { sanitizeText?: boolean; stripLegacyUserContext?: boolean } = {},
): AgentMessagePart[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((raw): AgentMessagePart[] => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const part = raw as Record<string, unknown>;

    if (part.type === "text" && typeof part.text === "string") {
      const withoutLegacyContext = options.stripLegacyUserContext
        ? stripLegacyUserPageContextPrefix(part.text)
        : part.text;
      return [
        {
          type: "text",
          text: options.sanitizeText ? sanitizeAgentVisibleText(withoutLegacyContext) : withoutLegacyContext,
        },
      ];
    }

    if (part.type === "activity" && typeof part.id === "string") {
      const activity = AgentActivityDescriptorSchema.safeParse(part.activity);
      if (!activity.success || !includes(ACTIVITY_STATUSES, part.status)) return [];
      return [
        {
          type: "activity",
          id: part.id,
          activity: activity.data,
          status: part.status,
        },
      ];
    }

    if (part.type === "approval" && typeof part.id === "string") {
      const activity = AgentActivityDescriptorSchema.safeParse(part.activity);
      if (!activity.success || !includes(APPROVAL_STATUSES, part.status)) return [];
      return [
        {
          type: "approval",
          id: part.id,
          activity: activity.data,
          status: part.status,
        },
      ];
    }

    if (part.type === "tool_use" && typeof part.id === "string" && typeof part.name === "string") {
      return [
        {
          type: "activity",
          id: part.id,
          activity: describeAgentTool(internalToolIdentity(part.name), part.input),
          status: includes(ACTIVITY_STATUSES, part.status) ? part.status : "done",
        },
      ];
    }

    return [];
  });
}

export function hasRenderableAgentMessageParts(parts: readonly AgentMessagePart[]) {
  return parts.some((part) => part.type !== "text" || part.text.trim().length > 0);
}

export function hasSuccessfulAgentMutation(parts: readonly AgentMessagePart[]) {
  return parts.some((part) => part.type === "activity" && part.status === "done" && part.activity.risk !== "read");
}

export const AgentDataCountsSchema = z.object({
  contacts: z.boolean(),
  organizations: z.boolean(),
  deals: z.boolean(),
  services: z.boolean(),
  tasks: z.boolean(),
  widgets: z.boolean(),
  connectedAccounts: z.boolean(),
});

export type AgentDataCounts = Data<typeof AgentDataCountsSchema>;

export const AgentConversationSummarySchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  preview: z.string(),
  updatedAt: z.date(),
});

export type AgentConversationSummary = Data<typeof AgentConversationSummarySchema>;

export const SUGGESTION_PAGE_IDS = [
  "dashboard",
  "inbox",
  "tasks",
  "contacts",
  "organizations",
  "deals",
  "services",
  "connected-accounts",
  "default",
] as const;

export type SuggestionPageId = (typeof SUGGESTION_PAGE_IDS)[number];

export function suggestionPageId(pathname: string): SuggestionPageId {
  if (pathname.startsWith("/profile/connected-accounts")) return "connected-accounts";
  const first = pathname.split("/")[1] ?? "";
  return SUGGESTION_PAGE_IDS.includes(first as SuggestionPageId) && first !== "default"
    ? (first as SuggestionPageId)
    : "default";
}

export function suggestionVariant(pageId: SuggestionPageId, counts: AgentDataCounts): "data" | "empty" {
  switch (pageId) {
    case "contacts":
      return counts.contacts ? "data" : "empty";
    case "organizations":
      return counts.organizations ? "data" : "empty";
    case "deals":
      return counts.deals ? "data" : "empty";
    case "services":
      return counts.services ? "data" : "empty";
    case "tasks":
      return counts.tasks ? "data" : "empty";
    case "dashboard":
      return counts.widgets ? "data" : "empty";
    case "inbox":
    case "connected-accounts":
      return counts.connectedAccounts ? "data" : "empty";
    default:
      return counts.contacts || counts.deals ? "data" : "empty";
  }
}

export function partsToText(parts: unknown): string {
  if (!Array.isArray(parts)) return "";

  return parts
    .filter((part): part is { type: "text"; text: string } => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

export const SUPPORT_TRANSCRIPT_MESSAGE_LIMIT = 20;
export const SUPPORT_TRANSCRIPT_LINE_MAX_CHARS = 1000;

export function formatSupportTranscript(messages: { role: string; parts: unknown }[]): string {
  return messages
    .map((message) => {
      const rawText = partsToText(message.parts);
      const text = sanitizeAgentVisibleText(
        message.role === "user" ? stripLegacyUserPageContextPrefix(rawText) : rawText,
      ).slice(0, SUPPORT_TRANSCRIPT_LINE_MAX_CHARS);
      return `${message.role === "user" ? "user" : "assistant"}: ${text}`;
    })
    .filter((line) => !line.endsWith(": "))
    .join("\n");
}
