import type { AgentRetrievalGrant, AgentUsageService } from "@/ee/agent-chat/agent-usage.service";

import { describe, expect, it, vi } from "vitest";

import { AGENT_CREDIT_MICROCENTS } from "@/core/commercial/agent-credits";

import { reserveWikiIndexSpend, WIKI_REINDEX_CAP_CREDITS } from "../wiki-index-spend";

const grant = { purpose: "wikiIndexing", companyId: "company", userId: null } as AgentRetrievalGrant;
const charge = { model: "m", inputTokens: 10, costMicrocents: 40, costSource: "measured" as const };

function usage(platform: "reserved" | "cap" | "unavailable") {
  const reservation = { id: "hold", grant, reservedMicrocents: 90, reservedAt: new Date() };
  const mocks = {
    reserveWorkspacePlatform: vi.fn(() =>
      Promise.resolve(
        platform === "reserved" ? { status: "reserved" as const, id: "platform-hold" } : { status: platform },
      ),
    ),
    settlePlatformRetrieval: vi.fn(() => Promise.resolve()),
    reserveRetrieval: vi.fn(() => Promise.resolve(reservation)),
    settleRetrieval: vi.fn(() => Promise.resolve()),
  };
  return { mocks, reservation, service: mocks as unknown as AgentUsageService };
}

describe("Knowledge Base index spend", () => {
  it("charges a rebuild from the previous search index to the platform within the per-workspace cap", async () => {
    const { mocks, service } = usage("reserved");

    const spend = await reserveWikiIndexSpend(service, { grant, model: "m", worstCaseMicrocents: 90, rebuild: true });
    await spend?.settle(charge, "grant");

    expect(mocks.reserveWorkspacePlatform).toHaveBeenCalledWith({
      companyId: "company",
      purpose: "wikiReindex",
      model: "m",
      worstCaseMicrocents: 90,
      capMicrocents: WIKI_REINDEX_CAP_CREDITS * AGENT_CREDIT_MICROCENTS,
    });
    expect(mocks.settlePlatformRetrieval).toHaveBeenCalledWith({ reservationId: "platform-hold", charge });
    expect(mocks.reserveRetrieval).not.toHaveBeenCalled();
  });

  it.each(["cap", "unavailable"] as const)(
    "falls back to the workspace allowance when the platform reservation is %s",
    async (status) => {
      const { mocks, reservation, service } = usage(status);

      const spend = await reserveWikiIndexSpend(service, { grant, model: "m", worstCaseMicrocents: 90, rebuild: true });
      await spend?.settle(charge, "grant");

      expect(mocks.settleRetrieval).toHaveBeenCalledWith({ reservation, charge, payer: "grant" });
      expect(mocks.settlePlatformRetrieval).not.toHaveBeenCalled();
    },
  );

  it("charges ordinary index updates to the workspace allowance", async () => {
    const { mocks, reservation, service } = usage("reserved");

    const spend = await reserveWikiIndexSpend(service, { grant, model: "m", worstCaseMicrocents: 90, rebuild: false });
    await spend?.settle(null, "platform");

    expect(mocks.reserveWorkspacePlatform).not.toHaveBeenCalled();
    expect(mocks.settleRetrieval).toHaveBeenCalledWith({ reservation, charge: null, payer: "platform" });
  });
});
