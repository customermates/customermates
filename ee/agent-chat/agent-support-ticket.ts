import { getCreateChatSupportTicketInteractor } from "@/core/di";
import { mcpInteractorFailure, type McpToolExecutionResult } from "@/features/mcp-tools/mcp-tool";

export async function createAgentSupportTicket(
  conversationId: string,
  subject: string,
  body: string,
): Promise<McpToolExecutionResult> {
  const result = await getCreateChatSupportTicketInteractor().invoke({
    conversationId,
    subject,
    body,
  });
  if (result.ok) {
    return {
      ok: true,
      result:
        "Support request email accepted for delivery. The Customermates team will reply to the email address on your account.",
    };
  }

  const failure = mcpInteractorFailure(result.error);
  return {
    ok: false,
    result: "The support request email could not be sent.",
    failure: failure.failure,
  };
}
