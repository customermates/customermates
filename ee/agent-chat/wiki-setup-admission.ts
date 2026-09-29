import type { Prisma } from "@/generated/prisma";

import { AGENT_RUN_LEASE_MS } from "./agent-turn-request";

export function activeWikiHomepageSetupWhere(companyId: string, now: Date): Prisma.AgentTurnRequestWhereInput {
  const freshnessCutoff = new Date(now.getTime() - AGENT_RUN_LEASE_MS);
  return {
    companyId,
    wikiHomepageSetupUrl: { not: null },
    status: { in: ["running", "waitingBudget"] },
    OR: [{ heartbeatAt: { gt: freshnessCutoff } }, { heartbeatAt: null, updatedAt: { gt: freshnessCutoff } }],
  };
}
