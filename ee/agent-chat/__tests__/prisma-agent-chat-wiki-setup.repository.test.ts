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
const clientRequestId = "00000000-0000-4000-8000-000000000001";
const prompt = "Set up the Workspace Wiki from https://example.com/.";
const homepageUrl = "https://example.com/";
const registrableDomain = "example.com";
const activeSetupWhere = {
  companyId: user.companyId,
  wikiHomepageSetupDomain: { not: null },
  status: { in: ["running", "waitingBudget"] },
  OR: [{ heartbeatAt: { gt: expect.any(Date) } }, { heartbeatAt: null, updatedAt: { gt: expect.any(Date) } }],
};
const turnSelect = {
  status: true,
  terminalCode: true,
  wikiHomepageSetupUrl: true,
  wikiHomepageSetupDomain: true,
  conversationId: true,
  userId: true,
  affectedResources: true,
};
const requestSelect = {
  clientRequestId: true,
  text: true,
  userId: true,
  wikiHomepageSetupDomain: true,
  wikiHomepageSetupUrl: true,
};
const storedSetup = {
  status: "running",
  terminalCode: null,
  wikiHomepageSetupUrl: homepageUrl,
  wikiHomepageSetupDomain: registrableDomain,
  conversationId: "conversation-other",
  userId: "00000000-0000-4000-8000-000000000099",
  affectedResources: [],
};

beforeEach(() => vi.clearAllMocks());

const findSetupTurn = () => runWithTenant(user, () => new PrismaAgentChatRepo().findWikiHomepageSetupTurn());
const findReusable = (homepage = homepageUrl) =>
  runWithTenant(user, () =>
    new PrismaAgentChatRepo().findReusableWikiHomepageSetupTurn({
      clientRequestId,
      homepageUrl: homepage,
      registrableDomain,
    }),
  );

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
        wikiHomepageSetupDomain: { not: null },
        wikiHomepageSetupUrl: { not: null },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: turnSelect,
    });
  });

  it("returns no setup when the company never started one", async () => {
    prismaMock.agentTurnRequest.findFirst.mockResolvedValue(null);

    await expect(findSetupTurn()).resolves.toBeNull();
  });

  it("reuses only the exact request or another setup that is still leased", async () => {
    prismaMock.agentTurnRequest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await expect(findReusable()).resolves.toBeNull();

    expect(prismaMock.agentTurnRequest.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        companyId: user.companyId,
        userId: user.id,
        wikiHomepageSetupDomain: { not: null },
        clientRequestId,
      },
      select: requestSelect,
    });
    expect(prismaMock.agentTurnRequest.findFirst).toHaveBeenNthCalledWith(2, {
      where: activeSetupWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: requestSelect,
    });
  });

  it("preserves exact-request idempotency even after the turn becomes terminal", async () => {
    prismaMock.agentTurnRequest.findFirst.mockResolvedValueOnce({
      clientRequestId,
      text: prompt,
      userId: user.id,
      wikiHomepageSetupDomain: registrableDomain,
      wikiHomepageSetupUrl: homepageUrl,
    });

    await expect(findReusable()).resolves.toEqual({ disposition: "reuse", clientRequestId, text: prompt });
    expect(prismaMock.agentTurnRequest.findFirst).toHaveBeenCalledOnce();
  });

  it("blocks a different active setup for the same company", async () => {
    prismaMock.agentTurnRequest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      clientRequestId: "00000000-0000-4000-8000-000000000099",
      text: "Set up the Workspace Wiki from https://other.example/.",
      userId: "00000000-0000-4000-8000-000000000099",
      wikiHomepageSetupDomain: "other.example",
      wikiHomepageSetupUrl: "https://other.example/",
    });

    await expect(findReusable()).resolves.toEqual({ disposition: "blocked" });
  });

  it("reuses the persisted request text for the same active homepage", async () => {
    const activeClientRequestId = "00000000-0000-4000-8000-000000000099";
    const persistedText = "A previously localized setup prompt.";
    prismaMock.agentTurnRequest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      clientRequestId: activeClientRequestId,
      text: persistedText,
      userId: user.id,
      wikiHomepageSetupDomain: registrableDomain,
      wikiHomepageSetupUrl: homepageUrl,
    });

    await expect(findReusable()).resolves.toEqual({
      disposition: "reuse",
      clientRequestId: activeClientRequestId,
      text: persistedText,
    });
  });

  it("blocks a reused request id with a different canonical homepage", async () => {
    prismaMock.agentTurnRequest.findFirst.mockResolvedValueOnce({
      clientRequestId,
      text: prompt,
      userId: user.id,
      wikiHomepageSetupDomain: registrableDomain,
      wikiHomepageSetupUrl: homepageUrl,
    });

    await expect(findReusable("https://example.com/about")).resolves.toEqual({ disposition: "blocked" });
  });
});
