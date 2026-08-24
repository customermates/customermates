import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { type Data, type Validated } from "@/core/validation/validation.utils";
import { createInteractorFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";
import { wakeAgentRunForCancellation } from "./agent-run-wake";

export const CancelAgentTurnSchema = z.object({ conversationId: z.uuid() }).strict();

export type CancelAgentTurnData = Data<typeof CancelAgentTurnSchema>;

const OutputSchema = z.object({ cancelling: z.boolean() });

@AllowInDemoMode
@TenantInteractor()
export class CancelAgentTurnInteractor extends AuthenticatedInteractor<CancelAgentTurnData, { cancelling: boolean }> {
  constructor(
    private repo: PrismaAgentChatRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Write({ input: CancelAgentTurnSchema, output: OutputSchema, tx: false })
  async invoke(data: CancelAgentTurnData): Validated<{ cancelling: boolean }> {
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;

    const conversation = await this.repo.findConversation(data.conversationId);
    if (!conversation) return createInteractorFailure(CustomErrorCode.agentConversationNotFound, ["conversationId"]);

    const cancelling = await this.repo.requestAgentTurnCancellation({ conversationId: data.conversationId });
    if (cancelling) await wakeAgentRunForCancellation(data.conversationId);

    return { ok: true as const, data: { cancelling } };
  }
}
