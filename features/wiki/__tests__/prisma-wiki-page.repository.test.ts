import { beforeEach, describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";

const prismaMock = vi.hoisted(() => ({
  agentTurnRequest: { findFirst: vi.fn() },
}));

vi.mock("@/prisma/db", () => ({ prisma: prismaMock }));

import { PrismaWikiPageRepo } from "../prisma-wiki-page.repository";

const user = createMockUser();
const clientRequestId = "00000000-0000-4000-8000-000000000001";
const prompt = "Set up the Workspace Wiki from https://example.com/.";

beforeEach(() => vi.clearAllMocks());

describe("PrismaWikiPageRepo homepage setup recovery", () => {
  it("reuses only the exact request or another setup that is still running", async () => {
    prismaMock.agentTurnRequest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await expect(
      runWithTenant(user, () => new PrismaWikiPageRepo().findReusableSetupRequestClientId({ clientRequestId, prompt })),
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
        userId: user.id,
        wikiHomepageSetupDomain: { not: null },
        text: prompt,
        status: "running",
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { clientRequestId: true },
    });
  });

  it("preserves exact-request idempotency even after the turn becomes terminal", async () => {
    prismaMock.agentTurnRequest.findFirst.mockResolvedValueOnce({ clientRequestId });

    await expect(
      runWithTenant(user, () => new PrismaWikiPageRepo().findReusableSetupRequestClientId({ clientRequestId, prompt })),
    ).resolves.toBe(clientRequestId);

    expect(prismaMock.agentTurnRequest.findFirst).toHaveBeenCalledOnce();
  });
});
