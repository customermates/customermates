import { beforeEach, describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";

const prismaMock = vi.hoisted(() => ({
  agentTurnRequest: { findFirst: vi.fn() },
  wikiPage: { findMany: vi.fn() },
}));

vi.mock("@/prisma/db", () => ({ prisma: prismaMock }));

import { PrismaWikiPageRepo } from "../prisma-wiki-page.repository";

const user = createMockUser();
const clientRequestId = "00000000-0000-4000-8000-000000000001";
const prompt = "Set up the Workspace Wiki from https://example.com/.";

beforeEach(() => vi.clearAllMocks());

describe("PrismaWikiPageRepo homepage setup recovery", () => {
  it("projects manual pages and hides another user's conversation id", async () => {
    const setup = {
      status: "running",
      terminalCode: null,
      wikiHomepageSetupUrl: "https://example.com/",
      wikiHomepageSetupDomain: "example.com",
      conversationId: "conversation-other",
      userId: "00000000-0000-4000-8000-000000000099",
      affectedResources: [],
      heartbeatAt: new Date("2026-09-22T09:05:00.000Z"),
      updatedAt: new Date("2026-09-22T09:00:00.000Z"),
    };
    const pages = [
      {
        id: "00000000-0000-4000-8000-000000000002",
        title: "Manual page",
        createdAt: new Date("2026-09-22T09:00:00.000Z"),
        updatedAt: new Date("2026-09-22T09:00:00.000Z"),
      },
    ];
    prismaMock.agentTurnRequest.findFirst.mockResolvedValue(setup);
    prismaMock.wikiPage.findMany.mockResolvedValue(pages);

    await expect(runWithTenant(user, () => new PrismaWikiPageRepo().getHomepageSetupProjection())).resolves.toEqual({
      setup: {
        status: "running",
        terminalCode: null,
        homepage: "https://example.com/",
        domain: "example.com",
        conversationId: null,
        affectedResources: [],
        activityAt: new Date("2026-09-22T09:05:00.000Z"),
      },
      pages,
    });
    expect(prismaMock.wikiPage.findMany).toHaveBeenCalledWith({
      where: { companyId: user.companyId },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 5,
    });
  });

  it("reuses only the exact request or another setup that is still running", async () => {
    prismaMock.agentTurnRequest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await expect(
      runWithTenant(user, () =>
        new PrismaWikiPageRepo().findReusableSetupRequest({
          clientRequestId,
          prompt,
        }),
      ),
    ).resolves.toBeNull();

    expect(prismaMock.agentTurnRequest.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        companyId: user.companyId,
        userId: user.id,
        wikiHomepageSetupDomain: { not: null },
        text: prompt,
        clientRequestId,
      },
      select: { clientRequestId: true },
    });
    expect(prismaMock.agentTurnRequest.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        companyId: user.companyId,
        wikiHomepageSetupDomain: { not: null },
        status: {
          in: ["running", "waitingBudget"],
        },
        OR: [{ heartbeatAt: { gt: expect.any(Date) } }, { heartbeatAt: null, updatedAt: { gt: expect.any(Date) } }],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { clientRequestId: true, text: true, userId: true },
    });
  });

  it("preserves exact-request idempotency even after the turn becomes terminal", async () => {
    prismaMock.agentTurnRequest.findFirst.mockResolvedValueOnce({
      clientRequestId,
    });

    await expect(
      runWithTenant(user, () =>
        new PrismaWikiPageRepo().findReusableSetupRequest({
          clientRequestId,
          prompt,
        }),
      ),
    ).resolves.toEqual({ disposition: "reuse", clientRequestId });

    expect(prismaMock.agentTurnRequest.findFirst).toHaveBeenCalledOnce();
  });

  it("blocks a different active setup for the same company", async () => {
    prismaMock.agentTurnRequest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      clientRequestId: "00000000-0000-4000-8000-000000000099",
      text: "Set up the Workspace Wiki from https://other.example/.",
      userId: "00000000-0000-4000-8000-000000000099",
    });

    await expect(
      runWithTenant(user, () =>
        new PrismaWikiPageRepo().findReusableSetupRequest({
          clientRequestId,
          prompt,
        }),
      ),
    ).resolves.toEqual({ disposition: "blocked" });
  });
});
