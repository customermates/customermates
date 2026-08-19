import { z } from "zod";

import { AgentApprovalDecision } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AgentSessionUnavailableError } from "@/core/errors/app-errors";
import { type Data, type Validated } from "@/core/validation/validation.utils";

import { RequiresAgentChat } from "./agent-availability";
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

@TenantInteractor()
export class RespondToApprovalInteractor extends AuthenticatedInteractor<RespondToApprovalData, { resolved: true }> {
  constructor(private repo: PrismaAgentChatRepo) {
    super();
  }

  @RequiresAgentChat
  @Write({ input: RespondToApprovalSchema, output: OutputSchema })
  async invoke(data: RespondToApprovalData): Validated<{ resolved: true }> {
    const conversation = await this.repo.findConversation(data.conversationId);
    if (!conversation) throw new AgentSessionUnavailableError("Conversation not found.");

    const resolved = await this.repo.resolvePendingApprovalRequest({
      conversationId: data.conversationId,
      requestId: data.requestId,
      decision: data.decision === "reject" ? AgentApprovalDecision.reject : AgentApprovalDecision.approve,
    });
    if (!resolved) throw new AgentSessionUnavailableError("Approval request is unavailable or expired.");

    return { ok: true as const, data: { resolved: true } };
  }
}
