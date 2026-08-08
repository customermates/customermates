import { z } from "zod";

import type { Data } from "@/core/validation/validation.utils";

import type { AgentConversationSummary } from "./agent-chat.schema";

export const AGENT_CONVERSATION_PAGE_SIZE = 25;
export const AGENT_MESSAGE_PAGE_SIZE = 50;

export const ListAgentConversationsSchema = z.object({
  query: z.string().trim().max(120).default(""),
  kind: z.enum(["active", "archived", "both"]).default("both"),
  cursor: z.string().max(500).nullable().optional(),
});

export type ListAgentConversationsData = Data<typeof ListAgentConversationsSchema>;

export type AgentConversationPage = {
  conversations: AgentConversationSummary[];
  nextCursor: string | null;
};

export type AgentConversationHistoryResult = {
  active: AgentConversationPage | null;
  archived: AgentConversationPage | null;
};

export const AgentMessagePageSchema = z.object({
  conversationId: z.uuid(),
  before: z.string().regex(/^\d+$/).max(40).nullable().optional(),
});

export type AgentMessagePageData = Data<typeof AgentMessagePageSchema>;
