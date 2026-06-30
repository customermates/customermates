import type { NextRequest } from "next/server";
import type { UIMessage } from "ai";

import { convertToModelMessages, stepCountIs, streamText } from "ai";

import { getAgentChatRepo, getListEnabledAgentSkillsInteractor, getUserService } from "@/core/di";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { getAgentModel, isAgentConfigured } from "@/core/ai/provider";
import { buildAgentTools } from "@/features/agent-chat/agent-tools";
import { buildAgentSystemPrompt } from "@/features/agent-chat/agent-prompt";
import { parseAgentPageContext } from "@/features/agent-chat/agent-chat.types";
import { repairDanglingToolCalls } from "@/features/agent-chat/sanitize-messages";
import { getPreAuthorizedToolNames } from "@/features/agent-chat/pre-authorized-tools";
import { SKILL_TOOL_NAME, skillTool } from "@/features/agent-chat/skill-tool";
import { uiTools } from "@/features/agent-chat/ui-tools";

// The agent loop can chain several tool calls plus model latency, so it needs
// more headroom than a plain request. The stream starts emitting immediately, so
// the user sees output well before this ceiling. Requires a Vercel plan that
// permits a raised maxDuration; lower it if your plan caps function duration.
export const maxDuration = 300;

function firstUserText(messages: UIMessage[]): string {
  const firstUser = messages.find((message) => message.role === "user");
  const text = (firstUser?.parts ?? [])
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .trim();
  return text;
}

function deriveTitle(messages: UIMessage[]): string {
  const text = firstUserText(messages);
  if (!text) return "New conversation";
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

export async function POST(req: NextRequest) {
  if (!isAgentConfigured()) return Response.json({ error: "ai_not_configured" }, { status: 503 });

  const user = await getUserService()
    .getActiveUserOrThrow()
    .catch(() => null);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const messages: UIMessage[] = Array.isArray(body?.messages) ? body.messages : [];
  const requestedConversationId =
    typeof body?.conversationId === "string" ? body.conversationId : typeof body?.id === "string" ? body.id : undefined;
  const pageContext = parseAgentPageContext(body?.pageContext);

  if (messages.length === 0) return Response.json({ error: "no_messages" }, { status: 400 });

  const repo = getAgentChatRepo();
  const preAuthorizedToolNames = getPreAuthorizedToolNames(user);
  const conversationId = requestedConversationId ?? crypto.randomUUID();
  const lastMessage = messages[messages.length - 1];

  // Ensure the conversation row exists (tenant-scoped to this user) and persist
  // the inbound user message before we start streaming.
  await runWithTenant(user, async () => {
    const existing = requestedConversationId ? await repo.getConversation(requestedConversationId) : null;
    if (existing) await repo.touchConversation(conversationId);
    else await repo.createConversation({ id: conversationId, title: deriveTitle(messages) });

    if (lastMessage?.role === "user") {
      await repo.saveMessage({
        conversationId,
        id: lastMessage.id,
        role: lastMessage.role,
        parts: lastMessage.parts,
      });
    }
  });

  const skillsResult = await getListEnabledAgentSkillsInteractor().invoke();
  const skills = skillsResult.ok ? skillsResult.data : [];

  const modelMessages = await convertToModelMessages(repairDanglingToolCalls(messages));

  const result = streamText({
    model: getAgentModel(),
    system: buildAgentSystemPrompt({ user, pageContext, skills, today: new Date().toISOString().slice(0, 10) }),
    messages: modelMessages,
    tools: { ...buildAgentTools({ preAuthorizedToolNames }), [SKILL_TOOL_NAME]: skillTool, ...uiTools },
    stopWhen: stepCountIs(12),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onError: (error) => {
      // Surface stream failures (e.g. tool errors, provider rejections) to the
      // server log; without this the route returns 200 with a silent error part.
      console.error("[agent] stream error", error);
      return error instanceof Error ? error.message : "Agent stream failed";
    },
    onFinish: async ({ responseMessage }) => {
      try {
        // A client that omits message ids would otherwise leave responseMessage.id
        // empty, collapsing every assistant turn onto one upserted row. Fall back to
        // a fresh id so each turn persists distinctly; real ids (from useChat) are
        // kept so multi-step resubmits still upsert the same message.
        await runWithTenant(user, () =>
          repo.saveMessage({
            conversationId,
            id: responseMessage.id || crypto.randomUUID(),
            role: responseMessage.role,
            parts: responseMessage.parts,
          }),
        );
      } catch (error) {
        console.error("[agent] failed to persist assistant message", error);
      }
    },
  });
}
