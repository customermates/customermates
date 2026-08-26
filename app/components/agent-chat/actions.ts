"use server";

import {
  getArchiveAgentConversationInteractor,
  getCancelAgentTurnInteractor,
  getDeleteAgentConversationInteractor,
  getGetAgentConfigInteractor,
  getGetAgentConversationInteractor,
  getListAgentConversationsInteractor,
  getRespondToApprovalInteractor,
  getRespondToUiCommandInteractor,
  getRestoreAgentConversationInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

import type { CancelAgentTurnData } from "@/ee/agent-chat/cancel-agent-turn.interactor";
import type { RespondToApprovalData } from "@/ee/agent-chat/respond-to-approval.interactor";
import type { RespondToUiCommandData } from "@/ee/agent-chat/respond-to-ui-command.interactor";
import type { ArchiveAgentConversationData } from "@/ee/agent-chat/archive-agent-conversation.interactor";
import type { ListAgentConversationsData } from "@/ee/agent-chat/agent-history";
import type { DeleteAgentConversationData } from "@/ee/agent-chat/delete-agent-conversation.interactor";

export async function getAgentConfigAction() {
  return serializeResult(getGetAgentConfigInteractor().invoke());
}

export async function getAgentConversationAction(conversationId: string, before?: string | null) {
  const result = await getGetAgentConversationInteractor().invoke({ conversationId, before });
  return result.ok ? result.data : null;
}

export async function listAgentConversationsAction(data: ListAgentConversationsData = { kind: "both" }) {
  const result = await getListAgentConversationsInteractor().invoke(data);
  return result.ok ? result.data : null;
}

export async function deleteAgentConversationAction(data: DeleteAgentConversationData) {
  return serializeResult(getDeleteAgentConversationInteractor().invoke(data));
}

export async function archiveAgentConversationAction(data: ArchiveAgentConversationData) {
  return serializeResult(getArchiveAgentConversationInteractor().invoke(data));
}

export async function restoreAgentConversationAction(data: ArchiveAgentConversationData) {
  return serializeResult(getRestoreAgentConversationInteractor().invoke(data));
}

export async function respondToApprovalAction(data: RespondToApprovalData) {
  return serializeResult(getRespondToApprovalInteractor().invoke(data));
}

export async function respondToUiCommandAction(data: RespondToUiCommandData) {
  return serializeResult(getRespondToUiCommandInteractor().invoke(data));
}

export async function cancelAgentTurnAction(data: CancelAgentTurnData) {
  return serializeResult(getCancelAgentTurnInteractor().invoke(data));
}
