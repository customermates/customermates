import { prismaAgentChatRepoDependencies } from "@/tests/helpers/prisma-agent-chat-repo";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";

const prismaMock = vi.hoisted(() => ({
  agentTurnRequest: { findFirst: vi.fn() },
}));

vi.mock("@/prisma/db", () => ({ prisma: prismaMock }));
vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    HOSTED_AI_MONTHLY_SPEND_CAP_MICROCENTS: null,
    HOSTED_AI_OPERATOR_CONTROLS_ENABLED: false,
    HOSTED_AI_PROVIDER_WORK_PAUSED: false,
  },
}));

import { PrismaAgentChatRepo } from "../prisma-agent-chat.repository";

const user = createMockUser();
const homepageUrl = "https://example.com/";
const registrableDomain = "example.com";
const activeSetupWhere = {
  companyId: user.companyId,
  wikiHomepageSetupUrl: { not: null },
  status: { in: ["running", "waitingBudget"] },
  OR: [{ heartbeatAt: { gt: expect.any(Date) } }, { heartbeatAt: null, updatedAt: { gt: expect.any(Date) } }],
};
const turnSelect = {
  status: true,
  terminalCode: true,
  wikiHomepageSetupUrl: true,
  conversationId: true,
  userId: true,
  affectedResources: true,
};
const storedSetup = {
  status: "running",
  terminalCode: null,
  wikiHomepageSetupUrl: homepageUrl,
  conversationId: "conversation-other",
  userId: "00000000-0000-4000-8000-000000000099",
  affectedResources: [],
};

beforeEach(() => vi.clearAllMocks());

const findSetupTurn = () =>
  runWithTenant(user, () => new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()).findWikiHomepageSetupTurn());

describe("PrismaAgentChatRepo Wiki homepage setup turns", () => {
  it("reports a leased setup as active and hides another user's conversation id", async () => {
    prismaMock.agentTurnRequest.findFirst.mockResolvedValueOnce(storedSetup);

    await expect(findSetupTurn()).resolves.toEqual({
      active: true,
      status: "running",
      terminalCode: null,
      homepage: homepageUrl,
      domain: registrableDomain,
      conversationId: null,
      affectedResources: [],
    });
    expect(prismaMock.agentTurnRequest.findFirst).toHaveBeenCalledOnce();
    expect(prismaMock.agentTurnRequest.findFirst).toHaveBeenCalledWith({
      where: activeSetupWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: turnSelect,
    });
  });

  it("falls back to the latest setup as inactive when no lease is fresh", async () => {
    prismaMock.agentTurnRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...storedSetup, userId: user.id, conversationId: "conversation-own" });

    await expect(findSetupTurn()).resolves.toMatchObject({
      active: false,
      status: "running",
      conversationId: "conversation-own",
    });
    expect(prismaMock.agentTurnRequest.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        companyId: user.companyId,
        wikiHomepageSetupUrl: { not: null },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: turnSelect,
    });
  });

  it("returns no setup when the stored homepage no longer parses as a public page", async () => {
    prismaMock.agentTurnRequest.findFirst.mockResolvedValueOnce({
      ...storedSetup,
      wikiHomepageSetupUrl: "https://localhost/",
    });

    await expect(findSetupTurn()).resolves.toBeNull();
  });

  it("returns no setup when the company never started one", async () => {
    prismaMock.agentTurnRequest.findFirst.mockResolvedValue(null);

    await expect(findSetupTurn()).resolves.toBeNull();
  });
});
