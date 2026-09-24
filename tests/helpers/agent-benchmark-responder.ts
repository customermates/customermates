import { runWithTenant } from "@/core/decorators/tenant-context";
import {
  getCancelAgentTurnInteractor,
  getRespondToApprovalInteractor,
  getRespondToUiCommandInteractor,
} from "@/core/di";
import { PrismaAgentChatRepo } from "@/ee/agent-chat/prisma-agent-chat.repository";
import { AGENT_RUN_LEASE_MS } from "@/ee/agent-chat/agent-turn-request";
import { createMockUser } from "@/tests/helpers/mock-user";

type BenchmarkActor = { companyId: string; userId: string };

export function respondToUiCommandAs(actor: BenchmarkActor, input: { conversationId: string; commandId: string; name: string }) {
  const user = createMockUser({ companyId: actor.companyId, id: actor.userId });
  return runWithTenant(user, () =>
    getRespondToUiCommandInteractor().invoke({
      conversationId: input.conversationId,
      commandId: input.commandId,
      name: input.name as never,
      ok: true,
      result: "Done.",
    }),
  );
}

export function respondToApprovalAs(actor: BenchmarkActor, input: { conversationId: string; requestId: string; decision: "approve" | "reject" }) {
  const user = createMockUser({ companyId: actor.companyId, id: actor.userId });
  return runWithTenant(user, () => getRespondToApprovalInteractor().invoke(input));
}

export function expireAgentRunLeaseAs(
  actor: BenchmarkActor,
  modelId: string,
) {
  const user = createMockUser({ companyId: actor.companyId, id: actor.userId });
  return runWithTenant(user, () =>
    new PrismaAgentChatRepo().normalizeExpiredAgentRunLease(
      new Date(Date.now() + AGENT_RUN_LEASE_MS * 2),
      modelId,
    ),
  );
}

export function cancelAgentTurnAs(
  actor: BenchmarkActor,
  conversationId: string,
) {
  const user = createMockUser({ companyId: actor.companyId, id: actor.userId });
  return runWithTenant(user, () =>
    getCancelAgentTurnInteractor().invoke({ conversationId }),
  );
}
