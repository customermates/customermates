import { runWithTenant } from "@/core/decorators/tenant-context";
import { getRespondToApprovalInteractor } from "@/core/di";
import { createMockUser } from "@/tests/helpers/mock-user";

type E2eActor = { companyId: string; userId: string };

export function respondToApprovalAs(
  actor: E2eActor,
  input: { conversationId: string; requestId: string; decision: "approve" | "reject" },
) {
  const user = createMockUser({ companyId: actor.companyId, id: actor.userId });
  return runWithTenant(user, () => getRespondToApprovalInteractor().invoke(input));
}
