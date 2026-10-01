import { prismaAgentChatRepoDependencies } from "@/tests/helpers/prisma-agent-chat-repo";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";

const db = vi.hoisted(() => ({
  wikiWebsiteCrawl: { findFirst: vi.fn(), updateMany: vi.fn() },
  agentTurnRequest: { findFirst: vi.fn() },
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock("@/prisma/db", () => ({ prisma: db }));
vi.mock("@/env", () => ({ env: { APP_MODE: "cloud" } }));

import { PrismaWikiWebsiteCrawlRepo } from "../prisma-wiki-website-crawl.repository";
import { PrismaWikiPageRepo } from "@/features/wiki/prisma-wiki-page.repository";
import { PrismaAgentChatRepo } from "@/ee/agent-chat/prisma-agent-chat.repository";

const user = createMockUser();
const identity = { userId: user.id, clientRequestId: "request", homepageUrl: "https://example.com/" };

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((fn) => fn(db));
  db.wikiWebsiteCrawl.findFirst.mockResolvedValue(identity);
  db.wikiWebsiteCrawl.updateMany.mockResolvedValue({ count: 1 });
  db.agentTurnRequest.findFirst.mockResolvedValue(null);
});

describe("Wiki crawl terminal settlement", () => {
  it.each(["error", "synthesisAdmission:agentLimitReached", "synthesisAdmission:invalidUrl"])(
    "preserves an admitted turn when concurrent %s arrives",
    async (failureReason) => {
      db.agentTurnRequest.findFirst.mockResolvedValue({ conversationId: "admitted-conversation" });
      await runWithTenant(user, () =>
        new PrismaWikiWebsiteCrawlRepo(
          new PrismaWikiPageRepo(),
          new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
        ).settleCrawl("crawl", {
          conversationId: null,
          failureReason,
        }),
      );
      expect(db.$transaction).toHaveBeenCalledOnce();
      expect(db.agentTurnRequest.findFirst).toHaveBeenCalledWith({
        where: {
          companyId: user.companyId,
          userId: user.id,
          clientRequestId: identity.clientRequestId,
          wikiHomepageSetupUrl: identity.homepageUrl,
        },
        select: { conversationId: true },
      });
      expect(db.wikiWebsiteCrawl.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: "completed",
            conversationId: "admitted-conversation",
            failureReason: null,
            finishedAt: expect.any(Date),
          },
        }),
      );
    },
  );

  it("fails unadmitted active work under the same lock and leaves terminal results untouched", async () => {
    await runWithTenant(user, () =>
      new PrismaWikiWebsiteCrawlRepo(
        new PrismaWikiPageRepo(),
        new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
      ).settleCrawl("crawl", {
        conversationId: null,
        failureReason: "error",
      }),
    );
    expect(db.wikiWebsiteCrawl.updateMany).toHaveBeenCalledWith({
      where: {
        id: "crawl",
        companyId: user.companyId,
        status: { in: ["queued", "discovering", "fetching", "importing", "synthesizing"] },
      },
      data: { status: "failed", conversationId: null, failureReason: "error", finishedAt: expect.any(Date) },
    });
  });
});
