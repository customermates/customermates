import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { type Validated } from "@/core/validation/validation.utils";
import { AgentSessionUnavailableError } from "@/core/errors/app-errors";

import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";
import { clientSafeAgentMessageParts, type AgentMessagePart } from "./agent-chat.schema";
import { sanitizeAgentConversationTitle } from "./agent-output-safety";
import type { AgentWorkspaceSetupRepo } from "./agent-workspace-setup.repository";
import { AgentMessagePageSchema, type AgentMessagePageData } from "./agent-history";

export const GetAgentConversationSchema = AgentMessagePageSchema;

export type GetAgentConversationData = AgentMessagePageData;

type AgentConversationDetail = {
  id: string;
  title: string | null;
  messages: { id: string; role: string; parts: unknown; createdAt: Date }[];
  nextCursor: string | null;
};

const OutputSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.string(),
      parts: z.array(z.any()),
      createdAt: z.date(),
    }),
  ),
  nextCursor: z.string().nullable(),
});

@AllowInDemoMode
@TenantInteractor()
export class GetAgentConversationInteractor extends AuthenticatedInteractor<
  GetAgentConversationData,
  AgentConversationDetail
> {
  constructor(
    private repo: PrismaAgentChatRepo,
    private setupRepo: AgentWorkspaceSetupRepo,
  ) {
    super();
  }

  @Validate(GetAgentConversationSchema)
  @ValidateOutput(OutputSchema)
  async invoke(data: GetAgentConversationData): Validated<AgentConversationDetail> {
    const conversation = await this.repo.findConversation(data.conversationId);
    if (!conversation) throw new AgentSessionUnavailableError("Conversation not found.");

    const page = await this.repo.listMessagePage(conversation.id, data.before);
    const messages = page.messages;
    const safeMessages = messages.map((message) => ({
      id: message.id,
      role: message.role,
      parts: clientSafeAgentMessageParts(message.parts, {
        sanitizeText: message.role !== "user",
        stripLegacyUserContext: message.role === "user",
      }),
      createdAt: message.createdAt,
    }));
    const setupParts = safeMessages.flatMap((message) =>
      message.parts.flatMap((part) => (part.type === "workspace_setup" ? [{ messageId: message.id, part }] : [])),
    );

    if (setupParts.length) {
      const setupStates = await this.setupRepo.listConversationSetupStates(conversation.id);
      const stateKey = (messageId: string, commandId: string, planHash: string) =>
        `${messageId}:${commandId}:${planHash}`;
      const stateByReview = new Map(
        setupStates.map((state) => [stateKey(state.reviewMessageId, state.commandId, state.planHash), state]),
      );
      const latestSetup = setupParts.at(-1);

      for (const message of safeMessages) {
        message.parts = message.parts.map((part): AgentMessagePart => {
          if (part.type !== "workspace_setup") return part;
          const state = stateByReview.get(stateKey(message.id, part.id, part.planHash));
          if (state) {
            return {
              ...part,
              setupId: state.setupId,
              status: state.status,
              ...(state.cleanupSummary ? { cleanupSummary: state.cleanupSummary } : {}),
            };
          }
          if (message.id !== latestSetup?.messageId || part !== latestSetup.part)
            return { ...part, status: "superseded" };
          return part;
        });
      }
    }

    return {
      ok: true as const,
      data: {
        id: conversation.id,
        title: sanitizeAgentConversationTitle(conversation.title),
        messages: safeMessages,
        nextCursor: page.nextCursor,
      },
    };
  }
}
