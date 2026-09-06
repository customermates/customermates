import { z } from "zod";

import type { Data } from "@/core/validation/validation.utils";

import { AgentConversationSummarySchema } from "./agent-chat.schema";

export const AGENT_CONVERSATION_PAGE_SIZE = 25;
export const AGENT_MESSAGE_PAGE_SIZE = 50;

export const AgentMessageTurnSchema = z.object({
  clientRequestId: z.string(),
  status: z.enum(["running", "waitingBudget", "needsAttention", "completed", "failed", "uncertain"]),
  assistantMessageId: z.string().nullable(),
  terminalCode: z.enum(["completed", "partial", "error", "cancelled", "policyBreach"]).nullable(),
});

export type AgentMessageTurn = Data<typeof AgentMessageTurnSchema>;

export const ListAgentConversationsSchema = z.object({
  kind: z.enum(["active", "archived", "both"]).default("both"),
  cursor: z.string().max(500).nullable().optional(),
});

export type ListAgentConversationsData = Data<typeof ListAgentConversationsSchema>;

export const AgentConversationPageSchema = z.object({
  conversations: z.array(AgentConversationSummarySchema),
  nextCursor: z.string().nullable(),
});

export const AgentConversationHistoryResultSchema = z.object({
  active: AgentConversationPageSchema.nullable(),
  archived: AgentConversationPageSchema.nullable(),
});

export type AgentConversationPage = Data<typeof AgentConversationPageSchema>;

export type AgentConversationHistoryResult = Data<typeof AgentConversationHistoryResultSchema>;

export const AgentMessagePageSchema = z.object({
  conversationId: z.uuid(),
  before: z.string().regex(/^\d+$/).max(40).nullable().optional(),
});

export type AgentMessagePageData = Data<typeof AgentMessagePageSchema>;
