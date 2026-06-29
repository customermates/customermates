export type AgentConversationSummary = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AgentStoredMessage = {
  id: string;
  role: string;
  parts: unknown;
  createdAt: Date;
};

/**
 * Persistence for agent-chat conversations and messages.
 *
 * Every method is tenant-scoped to the current user (companyId + userId) via the
 * BaseRepository tenant context — conversations are private to the user who
 * created them (the visibility column leaves room to share within a company
 * later without a migration).
 */
export abstract class AgentChatRepo {
  abstract createConversation(input: { id?: string; title: string }): Promise<AgentConversationSummary>;
  abstract listConversations(): Promise<AgentConversationSummary[]>;
  abstract getConversation(id: string): Promise<AgentConversationSummary | null>;
  abstract getMessages(conversationId: string): Promise<AgentStoredMessage[]>;
  abstract renameConversation(input: { id: string; title: string }): Promise<void>;
  abstract deleteConversation(id: string): Promise<void>;
  abstract saveMessage(input: { conversationId: string; id: string; role: string; parts: unknown }): Promise<void>;
  abstract touchConversation(id: string): Promise<void>;
  abstract setPreAuthorizedTools(toolNames: string[]): Promise<void>;
}
