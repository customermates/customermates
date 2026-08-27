import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { type Data, type Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";
import { clientSafeAgentMessageParts } from "./agent-chat.schema";
import { sanitizeAgentConversationTitle } from "./agent-output-safety";
import { AgentMessagePageSchema, type AgentMessagePageData } from "./agent-history";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

const Schema = AgentMessagePageSchema;

export type GetAgentConversationData = AgentMessagePageData;

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
  activeTurn: z.boolean(),
});

type AgentConversationDetail = Data<typeof OutputSchema>;

@AllowInDemoMode
@TenantInteractor()
export class GetAgentConversationInteractor extends AuthenticatedInteractor<
  GetAgentConversationData,
  AgentConversationDetail
> {
  constructor(
    private repo: PrismaAgentChatRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: GetAgentConversationData): Validated<AgentConversationDetail> {
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;

    const conversation = await this.repo.findConversation(data.conversationId);
    if (!conversation) return failNotFound(CustomErrorCode.agentConversationNotFound, ["conversationId"]);

    const [page, activeTurn] = await Promise.all([
      this.repo.listMessagePage(conversation.id, data.before),
      this.repo.hasRunningTurn(conversation.id),
    ]);
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
        activeTurn,
      },
    };
  }
}
