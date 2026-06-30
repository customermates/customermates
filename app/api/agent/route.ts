import type { NextRequest } from "next/server";
import type { UIMessage } from "ai";

import { convertToModelMessages, stepCountIs, streamText } from "ai";

import { getAgentChatRepo, getListEnabledAgentSkillsInteractor, getUserService } from "@/core/di";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { getAgentModel, isAgentConfigured } from "@/core/ai/provider";
import { buildAgentTools } from "@/features/agent-chat/agent-tools";
import { buildAgentSystemPrompt, type UploadedFileInfo } from "@/features/agent-chat/agent-prompt";
import { parseAgentPageContext } from "@/features/agent-chat/agent-chat.types";
import { repairDanglingToolCalls } from "@/features/agent-chat/sanitize-messages";
import { getPreAuthorizedToolNames } from "@/features/agent-chat/pre-authorized-tools";
import { extractUploadRefs, isFilePart, isVisionMime, parseUploadId } from "@/features/agent-chat/agent-uploads";
import { SKILL_TOOL_NAME, skillTool } from "@/features/agent-chat/skill-tool";
import { uiTools } from "@/features/agent-chat/ui-tools";
import { buildRunCodeTool } from "@/features/mcp-tools/code-exec.mcp-tools";
import { getUpload } from "@/features/code-exec/upload-store";

// The agent loop can chain several tool calls plus model latency, so it needs
// more headroom than a plain request. The stream starts emitting immediately, so
// the user sees output well before this ceiling. Requires a Vercel plan that
// permits a raised maxDuration; lower it if your plan caps function duration.
export const maxDuration = 300;

// Largest raw upload we inline as model vision content. Above this we leave it to
// run_code instead: base64 inflates ~33%, and the Anthropic API caps a single image
// at ~10 MB and the whole request at ~32 MB — a 25 MB image would 400. ~7 MB raw
// (~9.5 MB base64) stays comfortably under both.
const VISION_INLINE_MAX = 7 * 1024 * 1024;

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
  if (text) return text.length > 80 ? `${text.slice(0, 77)}…` : text;
  // A files-only first message has no text — fall back to the first attachment name.
  const firstUser = messages.find((message) => message.role === "user");
  for (const part of firstUser?.parts ?? []) {
    if (isFilePart(part) && part.filename)
      return part.filename.length > 80 ? `${part.filename.slice(0, 77)}…` : part.filename;
  }

  return "New conversation";
}

/**
 * Build the model-facing copy of the messages: image/PDF uploads are inlined as
 * base64 data URLs (read tenant-scoped from the upload store) so the model can see
 * them; non-vision uploads are removed from model content (the provider rejects
 * arbitrary file blocks) — the model learns of them from the system-prompt manifest
 * and reaches them via run_code. The PERSISTED messages keep the lightweight url
 * parts, so this hydration never bloats the DB or the chat transcript.
 */
function hydrateUploadsForModel(messages: UIMessage[], companyId: string): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== "user") return message;
    const dropped: string[] = [];
    const parts: UIMessage["parts"] = [];
    for (const part of message.parts ?? []) {
      // Inline narrowing (not the isFilePart predicate) keeps the real FileUIPart
      // type, so the rebuilt part stays assignable to UIMessage["parts"].
      if (part.type !== "file") {
        parts.push(part);
        continue;
      }
      const id = parseUploadId(part.url);
      const upload = id ? getUpload(id, companyId) : null;
      if (!upload) continue; // expired / unknown — drop silently
      if (isVisionMime(upload.mime) && upload.bytes.length <= VISION_INLINE_MAX) {
        parts.push({
          ...part,
          mediaType: upload.mime,
          url: `data:${upload.mime};base64,${upload.bytes.toString("base64")}`,
        });
        continue;
      }
      // Non-vision, or too large to inline — drop from model content (the manifest +
      // run_code still cover it).
      dropped.push(upload.name);
    }
    // Never emit an empty user turn (Anthropic 400s on empty content); note the
    // upload(s) — covering both the dropped path and all-unresolvable (expired) parts.
    if (parts.length === 0) {
      return {
        ...message,
        parts: [
          {
            type: "text" as const,
            text: dropped.length > 0 ? `(uploaded ${dropped.join(", ")})` : "(uploaded files are no longer available)",
          },
        ],
      };
    }

    return { ...message, parts };
  });
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

  // Resolve the conversation's uploads (tenant-checked). availableUploads feeds the
  // run_code tool (name -> id) and the system-prompt manifest; the model never sees
  // the bytes here — only image/PDF bytes are inlined for vision, server-side below.
  // Shared filenames are disambiguated ("data.csv" -> "data (2).csv") so each manifest
  // entry maps to exactly one upload (the tool keys name -> id; collisions would lose one).
  const nameCounts = new Map<string, number>();
  const availableUploads = extractUploadRefs(messages)
    .map((ref) => {
      const upload = getUpload(ref.id, user.companyId);
      return upload ? { id: ref.id, name: ref.name, mediaType: upload.mime, sizeBytes: upload.bytes.length } : null;
    })
    .filter((u): u is NonNullable<typeof u> => u !== null)
    .map((u) => {
      const seen = nameCounts.get(u.name) ?? 0;
      nameCounts.set(u.name, seen + 1);
      if (seen === 0) return u;
      const dot = u.name.lastIndexOf(".");
      const name = dot > 0 ? `${u.name.slice(0, dot)} (${seen + 1})${u.name.slice(dot)}` : `${u.name} (${seen + 1})`;
      return { ...u, name };
    });
  const uploadedFiles: UploadedFileInfo[] = availableUploads.map((u) => ({
    name: u.name,
    mediaType: u.mediaType,
    sizeBytes: u.sizeBytes,
  }));

  const modelMessages = await convertToModelMessages(
    repairDanglingToolCalls(hydrateUploadsForModel(messages, user.companyId)),
  );

  // Second prompt-cache breakpoint on the last message so the whole conversation
  // prefix — including any inlined image/PDF bytes — is cached across the multi-step
  // loop AND approval resubmits. Without it, vision bytes are uncached input re-billed
  // on every step/turn (the system breakpoint only caches the tools+system prefix).
  const lastModelMessage = modelMessages[modelMessages.length - 1];
  if (lastModelMessage) {
    lastModelMessage.providerOptions = {
      ...lastModelMessage.providerOptions,
      anthropic: { ...lastModelMessage.providerOptions?.anthropic, cacheControl: { type: "ephemeral" } },
    };
  }

  // Reuse the gated/pre-authorized tool set, but override run_code with a request-
  // scoped tool that can seed THIS conversation's uploads into the workspace.
  const agentTools = buildAgentTools({ preAuthorizedToolNames });
  if (agentTools.run_code)
    agentTools.run_code = buildRunCodeTool(availableUploads.map((u) => ({ id: u.id, name: u.name })));

  const result = streamText({
    model: getAgentModel(),
    // Prompt caching: the tools + system block is identical across the multi-step
    // loop AND across turns, yet it's the bulk of the input (~50 tool schemas).
    // Anthropic orders tools -> system -> messages, so a single cache breakpoint on
    // the system message caches that whole prefix — repeat steps/turns then read it
    // at ~1/10th the input price. Non-Anthropic providers ignore providerOptions.anthropic.
    messages: [
      {
        role: "system",
        content: buildAgentSystemPrompt({
          user,
          pageContext,
          skills,
          uploadedFiles,
          today: new Date().toISOString().slice(0, 10),
        }),
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      ...modelMessages,
    ],
    tools: { ...agentTools, [SKILL_TOOL_NAME]: skillTool, ...uiTools },
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
