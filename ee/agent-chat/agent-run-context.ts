import type { AgentTurnBudget } from "./agent-budget-policy";
import type { ReplayMessage } from "./agent-stream-utils";

export type AgentRunContext = {
  companyId: string;
  userId: string;
  runId: string;
  turnRequestId: string;
  userMessageId: string;
  clientRequestId: string;
  userName: string;
  conversationId: string;
  locale: string;
  appBaseUrl: string;
  messages: ReplayMessage[];
  turnBudget: AgentTurnBudget;
};
