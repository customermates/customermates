"use server";

import { z } from "zod";

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
import { env } from "@/env";

import type { RespondToApprovalData } from "@/features/agent-chat/respond-to-approval.interactor";
import type { RespondToUiCommandData } from "@/features/agent-chat/respond-to-ui-command.interactor";
import type { ArchiveAgentConversationData } from "@/features/agent-chat/archive-agent-conversation.interactor";
import type { ListAgentConversationsData } from "@/features/agent-chat/agent-history";
import type { DeleteAgentConversationData } from "@/features/agent-chat/delete-agent-conversation.interactor";

export async function getAgentConfigAction() {
  if (env.AGENT_CHAT_DISABLED) {
    return {
      ok: false as const,
      error: z.treeifyError(new z.ZodError([{ code: "custom", path: [], message: "The Assistant is unavailable." }])),
      code: "agentChatDisabled" as const,
    };
  }

  const result = await getGetAgentConfigInteractor().invoke();
  if (result.ok) return result;
  return { ok: false as const, error: z.treeifyError(result.error), code: result.code };
}

export async function getAgentConversationAction(conversationId: string, before?: string | null) {
  requireAgentChatEnabled();
  const result = await getGetAgentConversationInteractor().invoke({ conversationId, before });
  return result.ok ? result.data : null;
}

export async function listAgentConversationsAction(data: ListAgentConversationsData = { kind: "both" }) {
  requireAgentChatEnabled();
  const result = await getListAgentConversationsInteractor().invoke(data);
  return result.ok ? result.data : null;
}

export async function deleteAgentConversationAction(data: DeleteAgentConversationData) {
  requireAgentChatEnabled();
  return serializeResult(getDeleteAgentConversationInteractor().invoke(data));
}

export async function archiveAgentConversationAction(data: ArchiveAgentConversationData) {
  requireAgentChatEnabled();
  return serializeResult(getArchiveAgentConversationInteractor().invoke(data));
}

export async function restoreAgentConversationAction(data: ArchiveAgentConversationData) {
  requireAgentChatEnabled();
  return serializeResult(getRestoreAgentConversationInteractor().invoke(data));
}

export async function respondToApprovalAction(data: RespondToApprovalData) {
  requireAgentChatEnabled();
  return serializeResult(getRespondToApprovalInteractor().invoke(data));
}

export async function respondToUiCommandAction(data: RespondToUiCommandData) {
  requireAgentChatEnabled();
  return serializeResult(getRespondToUiCommandInteractor().invoke(data));
}

function requireAgentChatEnabled() {
  if (env.AGENT_CHAT_DISABLED) throw new Error("The Assistant is unavailable.");
}
