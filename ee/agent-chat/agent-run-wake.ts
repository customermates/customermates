import { getHookByToken, resumeHook } from "workflow/api";

import { agentApprovalHookToken } from "./agent-approval-resume";
import { agentUiCommandHookToken } from "./agent-ui-command";

async function resumeIfRegistered(token: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    const hook = await getHookByToken(token);
    if (!hook) return false;
    await resumeHook(token, payload);
    return true;
  } catch {
    return false;
  }
}

export async function wakeAgentApproval(conversationId: string, requestId: string): Promise<boolean> {
  return resumeIfRegistered(agentApprovalHookToken(conversationId), { requestId });
}

export async function wakeAgentUiCommand(conversationId: string, commandId: string): Promise<boolean> {
  return resumeIfRegistered(agentUiCommandHookToken(conversationId), { commandId });
}

export async function wakeAgentRunForCancellation(conversationId: string): Promise<boolean> {
  const woken = await resumeIfRegistered(agentApprovalHookToken(conversationId), { cancelled: true });
  if (woken) return true;
  return resumeIfRegistered(agentUiCommandHookToken(conversationId), { cancelled: true });
}
