import { z } from "zod";

import { AgentApprovalDecision } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { type Data, type Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

export const RespondToApprovalSchema = z
  .object({
    conversationId: z.uuid(),
    requestId: z.string().min(1),
    decision: z.enum(["approve", "reject"]),
  })
  .strict();

export type RespondToApprovalData = Data<typeof RespondToApprovalSchema>;

const OutputSchema = z.object({ resolved: z.literal(true) });

@AllowInDemoMode
@TenantInteractor()
export class RespondToApprovalInteractor extends AuthenticatedInteractor<RespondToApprovalData, { resolved: true }> {
  constructor(
    private repo: PrismaAgentChatRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Write({ input: RespondToApprovalSchema, output: OutputSchema })
  async invoke(data: RespondToApprovalData): Validated<{ resolved: true }> {
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;

    const conversation = await this.repo.findConversation(data.conversationId);
    if (!conversation) throw new Error("Conversation not found.");

    const resolved = await this.repo.resolvePendingApprovalRequest({
      conversationId: data.conversationId,
      requestId: data.requestId,
      decision: data.decision === "reject" ? AgentApprovalDecision.reject : AgentApprovalDecision.approve,
    });
    if (!resolved) throw new Error("Approval request is unavailable or expired.");

    return { ok: true as const, data: { resolved: true } };
  }
}
