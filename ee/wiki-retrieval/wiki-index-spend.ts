import type {
  AgentRetrievalCharge,
  AgentRetrievalGrant,
  AgentRetrievalPayer,
  AgentUsageService,
} from "@/ee/agent-chat/agent-usage.service";

import { AGENT_CREDIT_MICROCENTS } from "@/core/commercial/agent-credits";

export const WIKI_REINDEX_CAP_CREDITS = 100;

export type WikiIndexSpend = {
  settle: (charge: AgentRetrievalCharge | null, payer?: AgentRetrievalPayer) => Promise<void>;
};

type WikiIndexSpendUsage = Pick<
  AgentUsageService,
  "reserveRetrieval" | "settleRetrieval" | "reserveWorkspacePlatform" | "settlePlatformRetrieval"
>;

export async function reserveWikiIndexSpend(
  usage: WikiIndexSpendUsage,
  args: { grant: AgentRetrievalGrant; model: string; worstCaseMicrocents: number; rebuild: boolean },
): Promise<WikiIndexSpend | null> {
  if (args.rebuild) {
    const reserved = await usage.reserveWorkspacePlatform({
      companyId: args.grant.companyId,
      purpose: "wikiReindex",
      model: args.model,
      worstCaseMicrocents: args.worstCaseMicrocents,
      capMicrocents: WIKI_REINDEX_CAP_CREDITS * AGENT_CREDIT_MICROCENTS,
    });
    if (reserved.status === "reserved")
      return { settle: (charge) => usage.settlePlatformRetrieval({ reservationId: reserved.id, charge }) };
  }
  const reservation = await usage.reserveRetrieval({
    grant: args.grant,
    worstCaseMicrocents: args.worstCaseMicrocents,
    model: args.model,
  });
  if (!reservation) return null;
  return { settle: (charge, payer) => usage.settleRetrieval({ reservation, charge, payer }) };
}
