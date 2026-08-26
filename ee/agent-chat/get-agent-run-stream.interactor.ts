import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { type Data, type Validated } from "@/core/validation/validation.utils";
import { createInteractorFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

const Schema = z.object({ conversationId: z.uuid() }).strict();

export type GetAgentRunStreamData = Data<typeof Schema>;

const OutputSchema = z.object({ externalRunId: z.string() });

type AgentRunStream = Data<typeof OutputSchema>;

@AllowInDemoMode
@TenantInteractor()
export class GetAgentRunStreamInteractor extends AuthenticatedInteractor<GetAgentRunStreamData, AgentRunStream> {
  constructor(
    private repo: PrismaAgentChatRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: GetAgentRunStreamData): Validated<AgentRunStream> {
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;

    const conversation = await this.repo.findConversation(data.conversationId);
    if (!conversation) return createInteractorFailure(CustomErrorCode.agentConversationNotFound, ["conversationId"]);

    const externalRunId = await this.repo.findAgentTurnExternalRun(data.conversationId);
    if (!externalRunId) return createInteractorFailure(CustomErrorCode.agentConversationNotFound, ["conversationId"]);

    return { ok: true as const, data: { externalRunId } };
  }
}
