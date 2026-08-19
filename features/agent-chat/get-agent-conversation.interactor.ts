import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { type Validated } from "@/core/validation/validation.utils";
import { AgentSessionUnavailableError } from "@/core/errors/app-errors";

import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";
import { clientSafeAgentMessageParts } from "./agent-chat.schema";
import { sanitizeAgentConversationTitle } from "./agent-output-safety";
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
  constructor(private repo: PrismaAgentChatRepo) {
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
