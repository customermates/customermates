import { runWithTenant } from "@/core/decorators/tenant-context";
import { getRespondToApprovalInteractor, getRespondToUiCommandInteractor } from "@/core/di";
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
