"use server";

import { env } from "@/env";
import {
  getArchiveAgentConversationInteractor,
  getDeleteAgentConversationInteractor,
  getGetAgentConfigInteractor,
  getGetAgentConversationInteractor,
  getListAgentConversationsInteractor,
  getRespondToApprovalInteractor,
  getRespondToUiCommandInteractor,
  getRestoreAgentConversationInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

import type { RespondToApprovalData } from "@/features/agent-chat/respond-to-approval.interactor";
import type { RespondToUiCommandData } from "@/features/agent-chat/respond-to-ui-command.interactor";
import type { ArchiveAgentConversationData } from "@/features/agent-chat/archive-agent-conversation.interactor";
import type { ListAgentConversationsData } from "@/features/agent-chat/agent-history";
import type { DeleteAgentConversationData } from "@/features/agent-chat/delete-agent-conversation.interactor";

function isAgentChatEnabled() {
  return env.APP_MODE === "cloud" && env.AGENT_CHAT_ENABLED;
}

export async function getAgentConfigAction() {
  if (!isAgentChatEnabled()) return { enabled: false as const };

  const result = await getGetAgentConfigInteractor().invoke();
  return { enabled: true as const, config: result.ok ? result.data : null };
}

export async function getAgentConversationAction(conversationId: string, before?: string | null) {
  if (!isAgentChatEnabled()) return null;

  const result = await getGetAgentConversationInteractor().invoke({ conversationId, before });
  return result.ok ? result.data : null;
}

export async function listAgentConversationsAction(data: ListAgentConversationsData = { query: "", kind: "both" }) {
  if (!isAgentChatEnabled()) return { active: null, archived: null };

  const result = await getListAgentConversationsInteractor().invoke(data);
  return result.ok ? result.data : null;
}

export async function deleteAgentConversationAction(data: DeleteAgentConversationData) {
  if (!isAgentChatEnabled()) return null;

  return serializeResult(getDeleteAgentConversationInteractor().invoke(data));
}

export async function archiveAgentConversationAction(data: ArchiveAgentConversationData) {
  if (!isAgentChatEnabled()) return null;

  return serializeResult(getArchiveAgentConversationInteractor().invoke(data));
}

export async function restoreAgentConversationAction(data: ArchiveAgentConversationData) {
  if (!isAgentChatEnabled()) return null;

  return serializeResult(getRestoreAgentConversationInteractor().invoke(data));
}

export async function respondToApprovalAction(data: RespondToApprovalData) {
  if (!isAgentChatEnabled()) return null;

  return serializeResult(getRespondToApprovalInteractor().invoke(data));
}

export async function respondToUiCommandAction(data: RespondToUiCommandData) {
  if (!isAgentChatEnabled()) return null;

  return serializeResult(getRespondToUiCommandInteractor().invoke(data));
}
