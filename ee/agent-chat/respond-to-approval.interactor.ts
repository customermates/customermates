import { z } from "zod";

import { AgentApprovalDecision } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { type Data, type Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";
import { agentApprovalHookToken } from "./agent-approval-resume";
import { failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";

const Schema = z
  .object({
    conversationId: z.uuid(),
    requestId: z.string().min(1),
    decision: z.enum(["approve", "reject"]),
  })
  .strict();

export type RespondToApprovalData = Data<typeof Schema>;

const OutputSchema = z.object({ resolved: z.literal(true) });

@TenantInteractor()
export class RespondToApprovalInteractor extends AuthenticatedInteractor<RespondToApprovalData, { resolved: true }> {
  constructor(
    private repo: PrismaAgentChatRepo,
    private entitlements: EntitlementService,
    private backgroundTaskService: BackgroundTaskService,
  ) {
    super();
  }

  @Write({ input: Schema, output: OutputSchema })
  async invoke(data: RespondToApprovalData): Validated<{ resolved: true }> {
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;

    const conversation = await this.repo.findConversation(data.conversationId);
    if (!conversation) return failNotFound(CustomErrorCode.agentConversationNotFound, ["conversationId"]);

    const resolved = await this.repo.resolvePendingApprovalRequest({
      conversationId: data.conversationId,
      requestId: data.requestId,
      decision: data.decision === "reject" ? AgentApprovalDecision.reject : AgentApprovalDecision.approve,
    });
    if (!resolved) return failUnavailable(CustomErrorCode.agentApprovalUnavailable, ["requestId"]);

    await this.backgroundTaskService.resume(agentApprovalHookToken(data.conversationId), { requestId: data.requestId });

    return { ok: true as const, data: { resolved: true } };
  }
}
