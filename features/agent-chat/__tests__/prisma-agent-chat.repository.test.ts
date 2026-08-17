import { beforeEach, describe, expect, it, vi } from "vitest";

import { Status } from "@/generated/prisma";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
  agentConversation: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  agentMessage: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  contact: { findFirst: vi.fn() },
  organization: { findFirst: vi.fn() },
  deal: { findFirst: vi.fn() },
  service: { findFirst: vi.fn() },
  task: { findFirst: vi.fn() },
  connectedAccount: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  agentApproval: {
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  agentUiCommandResult: {
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
    upsert: vi.fn(),
  },
  agentTurnRequest: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  agentRunLease: { findFirst: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
  agentUsageEvent: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  supportTicket: { findFirst: vi.fn() },
}));

vi.mock("@/prisma/db", () => ({ prisma: prismaMock }));
vi.mock("@/env", () => ({ env: { APP_MODE: "cloud" } }));

import { runWithTenant } from "@/core/decorators/tenant-context";

import { PrismaAgentChatRepo } from "../prisma-agent-chat.repository";
import { buildAgentWorkspaceSetupPlan, hashAgentWorkspaceSetupPlan } from "../agent-workspace-setup";
import { pendingAgentApprovalToolName } from "../agent-approval";

const user = createMockUserWithPermissions([]);

function storedTurn(overrides: Record<string, unknown> = {}) {
  return {
    id: "turn-1",
    conversationId: "conversation-1",
    clientRequestId: "request-1",
    text: "Create a contact",
    pageRoute: "/en/contacts",
    status: "running",
    runId: "run-1",
    attemptCount: 1,
    providerStartedAt: null,
    userMessageId: "user-message-1",
    assistantMessageId: null,
    terminalCode: null,
    affectedResources: [],
    ...overrides,
  };
}

describe("PrismaAgentChatRepo tenant boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((callback) => callback(prismaMock));
    prismaMock.$executeRaw.mockResolvedValue(undefined);
  });

  it("scopes conversation lookup to the active company and user", async () => {
    prismaMock.agentConversation.findFirst.mockResolvedValue(null);

    await runWithTenant(user, () => new PrismaAgentChatRepo().findConversation("conversation-1"));

    expect(prismaMock.agentConversation.findFirst).toHaveBeenCalledWith({
      where: {
        id: "conversation-1",
        companyId: user.companyId,
        userId: user.id,
        archivedAt: null,
      },
    });
  });

  it("sanitizes a persisted conversation title before it can enter history search", async () => {
    prismaMock.agentConversation.create.mockResolvedValue({ id: "conversation-1" });

    await runWithTenant(user, () =>
      new PrismaAgentChatRepo().createConversation({
        title: '<page_context route="/private"/>Import failed apiKey=never-show',
      }),
    );

    expect(prismaMock.agentConversation.create).toHaveBeenCalledWith({
      data: {
        companyId: user.companyId,
        userId: user.id,
        title: "Import failed apiKey=[redacted]",
        selectedAt: expect.any(Date),
      },
    });
  });

  it("scopes retry message lookup through the owning active conversation", async () => {
    prismaMock.agentMessage.findFirst.mockResolvedValue(null);

    await runWithTenant(user, () => new PrismaAgentChatRepo().findUserMessage("message-1"));

    expect(prismaMock.agentMessage.findFirst).toHaveBeenCalledWith({
      where: {
        id: "message-1",
        companyId: user.companyId,
        role: "user",
        conversation: {
          companyId: user.companyId,
          userId: user.id,
          archivedAt: null,
        },
      },
      select: { id: true, conversationId: true, parts: true },
    });
  });

  it("keeps unread support visible even when a newer assistant message is the preview", async () => {
    prismaMock.agentConversation.findMany.mockResolvedValue([
      {
        id: "conversation-1",
        title: "Support",
        updatedAt: new Date("2026-08-06T10:00:00.000Z"),
        userLastReadSequence: 4n,
        messages: [
          {
            role: "assistant",
            parts: [{ type: "text", text: "I can help with that." }],
            createdAt: new Date("2026-08-06T10:00:00.000Z"),
          },
        ],
      },
    ]);
    prismaMock.agentMessage.findMany.mockResolvedValue([{ conversationId: "conversation-1", sequence: 5n }]);

    const result = await runWithTenant(user, () =>
      new PrismaAgentChatRepo().listConversationPage({ archived: false }).then((page) => page.conversations),
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "conversation-1",
        preview: "I can help with that.",
        unreadSupport: true,
      }),
    ]);
  });

  it("redacts internal assistant context from conversation previews", async () => {
    prismaMock.agentConversation.findMany.mockResolvedValue([
      {
        id: "conversation-1",
        title: "Private context",
        updatedAt: new Date("2026-08-06T10:00:00.000Z"),
        userLastReadAt: null,
        messages: [
          {
            role: "assistant",
            parts: [
              {
                type: "text",
                text: '<page_context route="/en/contacts"/>Opened 00000000-0000-4000-8000-000000000001.',
              },
            ],
            createdAt: new Date("2026-08-06T10:00:00.000Z"),
          },
        ],
      },
    ]);
    prismaMock.agentMessage.findMany.mockResolvedValue([]);

    const result = await runWithTenant(user, () =>
      new PrismaAgentChatRepo().listConversationPage({ archived: false }).then((page) => page.conversations),
    );

    expect(result[0]?.preview).toBe("Opened [internal reference].");
  });

  it("removes the legacy route envelope from user conversation previews", async () => {
    prismaMock.agentConversation.findMany.mockResolvedValue([
      {
        id: "conversation-1",
        title: '\uFEFF <page_context route="/en/deals"/>\nLegacy context',
        updatedAt: new Date("2026-08-06T10:00:00.000Z"),
        userLastReadAt: null,
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: '<page_context route="/en/deals"/>\nShow open deals' }],
            createdAt: new Date("2026-08-06T10:00:00.000Z"),
          },
        ],
      },
    ]);
    prismaMock.agentMessage.findMany.mockResolvedValue([]);

    const result = await runWithTenant(user, () =>
      new PrismaAgentChatRepo().listConversationPage({ archived: false }).then((page) => page.conversations),
    );

    expect(result[0]).toMatchObject({ title: "Legacy context", preview: "Show open deals" });
  });

  it("searches titles and sanitized transcript text with a stable 25-chat cursor", async () => {
    const rows = Array.from({ length: 26 }, (_, index) => ({
      id: `conversation-${String(index + 1).padStart(2, "0")}`,
      title: `Customer ${index + 1}`,
      updatedAt: new Date(`2026-08-${String(26 - index).padStart(2, "0")}T10:00:00.000Z`),
      userLastReadAt: null,
      messages: [],
    }));
    prismaMock.agentConversation.findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce([]);
    prismaMock.agentMessage.findMany.mockResolvedValue([]);
    const repo = new PrismaAgentChatRepo();

    const first = await runWithTenant(user, () =>
      repo.listConversationPage({ archived: false, query: "customer launch" }),
    );

    expect(first.conversations).toHaveLength(25);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(prismaMock.agentConversation.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: user.companyId,
          userId: user.id,
          archivedAt: null,
          AND: [
            {
              OR: [
                { title: { contains: "customer launch", mode: "insensitive" } },
                {
                  messages: {
                    some: { searchText: { contains: "customer launch", mode: "insensitive" } },
                  },
                },
              ],
            },
          ],
        }),
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 26,
      }),
    );

    await runWithTenant(user, () =>
      repo.listConversationPage({ archived: false, query: "customer launch", cursor: first.nextCursor }),
    );
    const secondWhere = prismaMock.agentConversation.findMany.mock.calls[1]?.[0]?.where;
    expect(secondWhere.AND[0]).toEqual({
      OR: [{ updatedAt: { lt: rows[24]?.updatedAt } }, { updatedAt: rows[24]?.updatedAt, id: { lt: rows[24]?.id } }],
    });
  });

  it("loads older messages in monotonic sequence order in pages of 50", async () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: `message-${51 - index}`,
      conversationId: "conversation-1",
      companyId: user.companyId,
      role: "assistant",
      parts: [{ type: "text", text: `Message ${51 - index}` }],
      createdAt: new Date(0),
      sequence: BigInt(51 - index),
    }));
    prismaMock.agentMessage.findMany.mockResolvedValue(rows);

    const result = await runWithTenant(user, () => new PrismaAgentChatRepo().listMessagePage("conversation-1", "52"));

    expect(result.messages).toHaveLength(50);
    expect(result.messages[0]?.sequence).toBe(2n);
    expect(result.messages.at(-1)?.sequence).toBe(51n);
    expect(result.nextCursor).toBe("2");
    expect(prismaMock.agentMessage.findMany).toHaveBeenCalledWith({
      where: {
        conversationId: "conversation-1",
        companyId: user.companyId,
        conversation: { userId: user.id, companyId: user.companyId, archivedAt: null },
        sequence: { lt: 52n },
      },
      orderBy: { sequence: "desc" },
      take: 51,
    });
  });

  it("permanently deletes only an archived conversation owned by the current user", async () => {
    prismaMock.agentConversation.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      runWithTenant(user, () => new PrismaAgentChatRepo().deleteArchivedConversation("conversation-1")),
    ).resolves.toBe(true);
    expect(prismaMock.agentConversation.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "conversation-1",
        companyId: user.companyId,
        userId: user.id,
        archivedAt: { not: null },
      },
    });
  });

  it("refuses to archive or delete a conversation while its turn is running", async () => {
    prismaMock.agentTurnRequest.findFirst
      .mockResolvedValueOnce({ id: "turn-1" })
      .mockResolvedValueOnce({ id: "turn-1" });

    await expect(
      runWithTenant(user, () => new PrismaAgentChatRepo().archiveConversation("conversation-1")),
    ).resolves.toBe(false);
    await expect(
      runWithTenant(user, () => new PrismaAgentChatRepo().deleteArchivedConversation("conversation-1")),
    ).resolves.toBe(false);

    expect(prismaMock.agentConversation.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.agentConversation.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.agentTurnRequest.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        conversationId: "conversation-1",
        companyId: user.companyId,
        userId: user.id,
        status: "running",
      },
      select: { id: true },
    });
  });

  it("permission-scopes empty-state signals instead of leaking company-wide existence", async () => {
    await runWithTenant(user, () => new PrismaAgentChatRepo().getSuggestionSignals());

    expect(prismaMock.contact.findFirst).toHaveBeenCalledWith({
      where: { id: { in: [] }, companyId: user.companyId },
      select: { id: true },
    });
    expect(prismaMock.connectedAccount.findFirst).toHaveBeenCalledWith({
      where: { companyId: user.companyId, id: { in: [] } },
      select: { id: true },
    });
  });

  it("routes a sanitized support reply through its ticket and restores an archived conversation", async () => {
    const ticketId = "00000000-0000-4000-8000-000000000020";
    const messageId = "00000000-0000-4000-8000-000000000021";
    prismaMock.supportTicket.findFirst.mockResolvedValue({
      id: ticketId,
      companyId: user.companyId,
      userId: user.id,
      source: "chat",
      agentConversationId: "conversation-1",
    });
    prismaMock.agentMessage.findFirst.mockResolvedValue(null);
    prismaMock.agentConversation.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.agentMessage.create.mockResolvedValue({ id: messageId });

    const result = await new PrismaAgentChatRepo().createSupportMessageForTicketOrThrowUnscoped({
      ticketId,
      messageId,
      text: '<page_context route="/private"/>We can help. apiKey=never-show',
    });

    const promotedAt = prismaMock.agentConversation.updateMany.mock.calls[0]?.[0]?.data.updatedAt as Date;
    expect(result).toEqual({ id: messageId, created: true });
    expect(prismaMock.supportTicket.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        id: ticketId,
        source: "chat",
        agentConversationId: { not: null },
      },
      select: {
        id: true,
        companyId: true,
        userId: true,
        source: true,
        agentConversationId: true,
      },
    });
    expect(prismaMock.agentConversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: "conversation-1",
        companyId: user.companyId,
        userId: user.id,
      },
      data: { archivedAt: null, updatedAt: promotedAt },
    });
    expect(prismaMock.agentMessage.create).toHaveBeenCalledWith({
      data: {
        id: messageId,
        conversationId: "conversation-1",
        companyId: user.companyId,
        role: "support",
        parts: [{ type: "text", text: "We can help. apiKey=[redacted]" }],
        searchText: "We can help. apiKey=[redacted]",
        createdAt: promotedAt,
      },
    });
  });

  it("makes ticket-routed support delivery idempotent without changing selection", async () => {
    const ticketId = "00000000-0000-4000-8000-000000000020";
    const messageId = "00000000-0000-4000-8000-000000000021";
    prismaMock.supportTicket.findFirst.mockResolvedValue({
      id: ticketId,
      companyId: user.companyId,
      userId: user.id,
      source: "chat",
      agentConversationId: "conversation-1",
    });
    prismaMock.agentMessage.findFirst.mockResolvedValue({ id: messageId });

    await expect(
      new PrismaAgentChatRepo().createSupportMessageForTicketOrThrowUnscoped({
        ticketId,
        messageId,
        text: "We can help.",
      }),
    ).resolves.toEqual({ id: messageId, created: false });

    expect(prismaMock.agentConversation.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.agentMessage.create).not.toHaveBeenCalled();
  });

  it("fails closed when a ticket no longer has a hosted chat correlation", async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue(null);

    await expect(
      new PrismaAgentChatRepo().createSupportMessageForTicketOrThrowUnscoped({
        ticketId: "00000000-0000-4000-8000-000000000020",
        messageId: "00000000-0000-4000-8000-000000000021",
        text: "We can help.",
      }),
    ).rejects.toThrow("no hosted Assistant conversation");

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.agentMessage.create).not.toHaveBeenCalled();
  });

  it("marks only the observed support sequence so an equal-time racing reply stays unread", async () => {
    const observedAt = new Date("2026-08-06T09:00:00.000Z");
    prismaMock.agentMessage.findFirst.mockResolvedValue({
      createdAt: observedAt,
      sequence: 10n,
    });
    prismaMock.agentConversation.updateMany.mockResolvedValue({ count: 1 });

    await runWithTenant(user, () =>
      new PrismaAgentChatRepo().markConversationRead("conversation-1", "00000000-0000-4000-8000-000000000010"),
    );

    expect(prismaMock.agentConversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: "conversation-1",
        companyId: user.companyId,
        userId: user.id,
        archivedAt: null,
        OR: [{ userLastReadSequence: null }, { userLastReadSequence: { lt: 10n } }],
      },
      data: {
        userLastReadAt: observedAt,
        userLastReadSequence: 10n,
        selectedAt: expect.any(Date),
      },
    });

    prismaMock.agentConversation.findMany.mockResolvedValue([
      {
        id: "conversation-1",
        title: "Support",
        updatedAt: observedAt,
        userLastReadSequence: 10n,
        messages: [
          {
            role: "support",
            parts: [{ type: "text", text: "A newer reply" }],
            createdAt: observedAt,
          },
        ],
      },
    ]);
    prismaMock.agentMessage.findMany.mockResolvedValue([{ conversationId: "conversation-1", sequence: 11n }]);

    await expect(
      runWithTenant(user, () =>
        new PrismaAgentChatRepo().listConversationPage({ archived: false }).then((page) => page.conversations),
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "conversation-1",
        unreadSupport: true,
      }),
    ]);
  });

  it("counts unread support replies rather than conversations", async () => {
    prismaMock.agentConversation.findMany.mockResolvedValue([
      {
        userLastReadSequence: 10n,
        messages: [{ sequence: 9n }, { sequence: 11n }, { sequence: 12n }],
      },
      {
        userLastReadSequence: null,
        messages: [{ sequence: 13n }],
      },
    ]);

    await expect(runWithTenant(user, () => new PrismaAgentChatRepo().countUnreadSupport())).resolves.toBe(3);
    expect(prismaMock.agentConversation.findMany).toHaveBeenCalledWith({
      where: { companyId: user.companyId, userId: user.id, archivedAt: null },
      select: {
        userLastReadSequence: true,
        messages: {
          where: { role: "support" },
          select: { sequence: true },
        },
      },
    });
  });

  it("compares the latest support sequence when checking one conversation", async () => {
    prismaMock.agentConversation.findFirst.mockResolvedValue({
      userLastReadSequence: 20n,
      messages: [{ sequence: 21n }],
    });

    await expect(
      runWithTenant(user, () => new PrismaAgentChatRepo().isConversationSupportUnread("conversation-1")),
    ).resolves.toBe(true);
  });

  it("persists an assistant reply only after atomically claiming an active conversation", async () => {
    prismaMock.agentConversation.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.agentMessage.create.mockResolvedValue({ id: "message-1" });
    const parts = [{ type: "text", text: "Done." }];

    await new PrismaAgentChatRepo().createAssistantMessageOrThrowUnscoped({
      conversationId: "conversation-1",
      companyId: user.companyId,
      userId: user.id,
      parts,
    });

    const promotedAt = prismaMock.agentConversation.updateMany.mock.calls[0]?.[0]?.data.updatedAt as Date;
    expect(prismaMock.agentConversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: "conversation-1",
        companyId: user.companyId,
        userId: user.id,
        archivedAt: null,
      },
      data: { updatedAt: promotedAt },
    });
    expect(prismaMock.agentMessage.create).toHaveBeenCalledWith({
      data: {
        conversationId: "conversation-1",
        companyId: user.companyId,
        role: "assistant",
        parts,
        searchText: "Done.",
        createdAt: promotedAt,
      },
    });
    expect(prismaMock.agentConversation.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.agentMessage.create.mock.invocationCallOrder[0],
    );
  });

  it("does not persist an assistant reply after a conversation is archived", async () => {
    prismaMock.agentConversation.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      new PrismaAgentChatRepo().createAssistantMessageOrThrowUnscoped({
        conversationId: "conversation-1",
        companyId: user.companyId,
        userId: user.id,
        parts: [{ type: "text", text: "Too late." }],
      }),
    ).rejects.toThrow("Conversation not found");
    expect(prismaMock.agentMessage.create).not.toHaveBeenCalled();
  });

  it("loads only a validated reviewed setup from the active owned conversation", async () => {
    const setup = {
      useCase: "b2bSales" as const,
      businessName: "Acme",
      goal: "Build a useful sales workspace",
    };
    const plan = buildAgentWorkspaceSetupPlan(setup);
    const planHash = await hashAgentWorkspaceSetupPlan(plan);
    prismaMock.agentMessage.findMany.mockResolvedValue([
      {
        id: "message-1",
        parts: [
          {
            type: "workspace_setup",
            id: "other-command",
            status: "ready",
            setup,
            plan,
            planHash,
          },
          {
            type: "workspace_setup",
            id: "command-1",
            status: "ready",
            setup,
            plan,
            planHash,
          },
        ],
      },
    ]);

    const result = await runWithTenant(user, () =>
      new PrismaAgentChatRepo().findReviewedWorkspaceSetup({
        conversationId: "conversation-1",
        commandId: "command-1",
      }),
    );

    expect(result).toEqual({ reviewMessageId: "message-1", plan, planHash });
    expect(prismaMock.agentMessage.findMany).toHaveBeenCalledWith({
      where: {
        conversationId: "conversation-1",
        companyId: user.companyId,
        role: "assistant",
        conversation: {
          userId: user.id,
          companyId: user.companyId,
          archivedAt: null,
        },
      },
      orderBy: { sequence: "desc" },
      take: 200,
      select: { id: true, parts: true, sequence: true },
    });
  });

  it("finds a reviewed setup beyond the first assistant-message scan page", async () => {
    const setup = {
      useCase: "b2bSales" as const,
      businessName: "Acme",
      goal: "Build a useful sales workspace",
    };
    const plan = buildAgentWorkspaceSetupPlan(setup);
    const planHash = await hashAgentWorkspaceSetupPlan(plan);
    prismaMock.agentMessage.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 200 }, (_, index) => ({
          id: `message-${400 - index}`,
          parts: [],
          sequence: BigInt(400 - index),
        })),
      )
      .mockResolvedValueOnce([
        {
          id: "message-200",
          parts: [
            {
              type: "workspace_setup",
              id: "command-1",
              status: "ready",
              setup,
              plan,
              planHash,
            },
          ],
          sequence: 200n,
        },
      ]);

    await expect(
      runWithTenant(user, () =>
        new PrismaAgentChatRepo().findReviewedWorkspaceSetup({
          conversationId: "conversation-1",
          commandId: "command-1",
        }),
      ),
    ).resolves.toEqual({ reviewMessageId: "message-200", plan, planHash });

    expect(prismaMock.agentMessage.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ sequence: { lt: 201n } }),
      }),
    );
  });

  it("rejects a malformed or unfinished setup review", async () => {
    prismaMock.agentMessage.findMany.mockResolvedValue([
      {
        id: "message-1",
        parts: [
          {
            type: "workspace_setup",
            id: "command-1",
            status: "preparing",
            setup: { useCase: "invented" },
            plan: { schemaVersion: 1 },
          },
        ],
      },
    ]);

    await expect(
      runWithTenant(user, () =>
        new PrismaAgentChatRepo().findReviewedWorkspaceSetup({
          conversationId: "conversation-1",
          commandId: "command-1",
        }),
      ),
    ).resolves.toBeNull();
  });

  it("supersedes an older reviewed setup when a newer setup command exists", async () => {
    const setup = {
      useCase: "b2bSales" as const,
      businessName: "Acme",
      goal: "Build a useful sales workspace",
    };
    const plan = buildAgentWorkspaceSetupPlan(setup);
    const planHash = await hashAgentWorkspaceSetupPlan(plan);
    prismaMock.agentMessage.findMany.mockResolvedValue([
      {
        id: "message-2",
        parts: [
          {
            type: "workspace_setup",
            id: "newer-command",
            status: "ready",
            setup,
            plan,
            planHash,
          },
        ],
      },
      {
        id: "message-1",
        parts: [
          {
            type: "workspace_setup",
            id: "command-1",
            status: "ready",
            setup,
            plan,
            planHash,
          },
        ],
      },
    ]);

    await expect(
      runWithTenant(user, () =>
        new PrismaAgentChatRepo().findReviewedWorkspaceSetup({
          conversationId: "conversation-1",
          commandId: "command-1",
        }),
      ),
    ).resolves.toBeNull();
  });

  it("rejects a reviewed setup when its persisted plan hash does not match", async () => {
    const setup = {
      useCase: "b2bSales" as const,
      businessName: "Acme",
      goal: "Build a useful sales workspace",
    };
    const plan = buildAgentWorkspaceSetupPlan(setup);
    prismaMock.agentMessage.findMany.mockResolvedValue([
      {
        id: "message-1",
        parts: [
          {
            type: "workspace_setup",
            id: "command-1",
            status: "ready",
            setup,
            plan,
            planHash: "0".repeat(64),
          },
        ],
      },
    ]);

    await expect(
      runWithTenant(user, () =>
        new PrismaAgentChatRepo().findReviewedWorkspaceSetup({
          conversationId: "conversation-1",
          commandId: "command-1",
        }),
      ),
    ).resolves.toBeNull();
  });

  it("scopes the runner's approval poll to the expected owner", async () => {
    prismaMock.agentApproval.findFirst.mockResolvedValue(null);

    await new PrismaAgentChatRepo().findApprovalDecisionUnscoped({
      conversationId: "conversation-1",
      requestId: "request-1",
      companyId: user.companyId,
      userId: user.id,
    });

    expect(prismaMock.agentApproval.findFirst).toHaveBeenCalledWith({
      where: {
        conversationId: "conversation-1",
        requestId: "request-1",
        companyId: user.companyId,
        conversation: { companyId: user.companyId, userId: user.id },
      },
      select: { decision: true, toolName: true },
    });
  });

  it("persists a server-owned pending approval before exposing its request id", async () => {
    const expiresAt = new Date("2099-08-06T10:00:00.000Z");
    prismaMock.agentConversation.findFirst.mockResolvedValue({
      id: "conversation-1",
    });

    await new PrismaAgentChatRepo().createPendingApprovalRequestOrThrowUnscoped({
      conversationId: "conversation-1",
      requestId: "request-1",
      toolName: "create_contacts",
      companyId: user.companyId,
      userId: user.id,
      expiresAt,
    });

    expect(prismaMock.agentApproval.create).toHaveBeenCalledWith({
      data: {
        conversationId: "conversation-1",
        companyId: user.companyId,
        requestId: "request-1",
        toolName: pendingAgentApprovalToolName("create_contacts", expiresAt),
        decision: "reject",
      },
    });
  });

  it("atomically resolves only the pending owned approval and derives its tool server-side", async () => {
    const pendingToolName = pendingAgentApprovalToolName("create_contacts", new Date(Date.now() + 60_000));
    prismaMock.agentApproval.findFirst.mockResolvedValue({
      id: "approval-1",
      toolName: pendingToolName,
    });
    prismaMock.agentApproval.updateMany.mockResolvedValue({ count: 1 });

    const result = await runWithTenant(user, () =>
      new PrismaAgentChatRepo().resolvePendingApprovalRequest({
        conversationId: "conversation-1",
        requestId: "request-1",
        decision: "approve",
      }),
    );

    expect(result).toEqual({ toolName: "create_contacts", resolved: true });
    expect(prismaMock.agentApproval.updateMany).toHaveBeenCalledWith({
      where: {
        id: "approval-1",
        companyId: user.companyId,
        toolName: pendingToolName,
      },
      data: { decision: "approve", toolName: "create_contacts" },
    });
  });

  it("deletes an expired pending approval instead of resolving it", async () => {
    const pendingToolName = pendingAgentApprovalToolName("delete_records", new Date(Date.now() - 60_000));
    prismaMock.agentApproval.findFirst.mockResolvedValue({
      id: "approval-1",
      toolName: pendingToolName,
    });

    const result = await runWithTenant(user, () =>
      new PrismaAgentChatRepo().resolvePendingApprovalRequest({
        conversationId: "conversation-1",
        requestId: "request-1",
        decision: "approve",
      }),
    );

    expect(result).toBeNull();
    expect(prismaMock.agentApproval.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.agentApproval.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "approval-1",
        companyId: user.companyId,
        toolName: pendingToolName,
      },
    });
  });

  it("scopes UI result consumption to the expected owner", async () => {
    prismaMock.agentUiCommandResult.findFirst.mockResolvedValue(null);

    await new PrismaAgentChatRepo().takeUiCommandResultUnscoped({
      conversationId: "conversation-1",
      commandId: "command-1",
      companyId: user.companyId,
      userId: user.id,
    });

    expect(prismaMock.agentUiCommandResult.findFirst).toHaveBeenCalledWith({
      where: {
        conversationId: "conversation-1",
        commandId: "command-1",
        companyId: user.companyId,
        conversation: { companyId: user.companyId, userId: user.id },
      },
      select: { id: true, name: true, ok: true, result: true },
    });
    expect(prismaMock.agentUiCommandResult.deleteMany).not.toHaveBeenCalled();
  });

  it("looks the UI result up by a tenant-scoped key so the update branch cannot cross companies", async () => {
    await runWithTenant(user, () =>
      new PrismaAgentChatRepo().recordUiCommandResult({
        conversationId: "conversation-1",
        commandId: "command-1",
        name: "navigate",
        ok: true,
        result: "navigated",
      }),
    );

    expect(prismaMock.agentUiCommandResult.upsert).toHaveBeenCalledWith({
      where: {
        companyId_conversationId_commandId: {
          companyId: user.companyId,
          conversationId: "conversation-1",
          commandId: "command-1",
        },
      },
      create: {
        conversationId: "conversation-1",
        commandId: "command-1",
        name: "navigate",
        ok: true,
        result: "navigated",
        companyId: user.companyId,
      },
      update: {
        name: "navigate",
        ok: true,
        result: "navigated",
      },
    });
  });

  it("claims a run lease without blindly deleting an expired owner lease", async () => {
    prismaMock.agentRunLease.createMany.mockResolvedValue({ count: 0 });

    const claimed = await runWithTenant(user, () =>
      new PrismaAgentChatRepo().claimAgentRunLease("run-2", new Date("2026-08-06T11:00:00.000Z")),
    );

    expect(claimed).toBe(false);
    expect(prismaMock.agentRunLease.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: user.id,
          companyId: user.companyId,
          runId: "run-2",
          expiresAt: new Date("2026-08-06T11:00:00.000Z"),
        },
      ],
      skipDuplicates: true,
    });
    expect(prismaMock.agentRunLease.deleteMany).not.toHaveBeenCalled();
  });

  it("durably downgrades a completed turn whose terminal code is missing", async () => {
    const now = new Date("2026-08-06T10:00:00.000Z");
    prismaMock.agentTurnRequest.findFirst.mockResolvedValue(
      storedTurn({
        status: "completed",
        assistantMessageId: "assistant-message-1",
        terminalCode: null,
      }),
    );
    prismaMock.agentMessage.findFirst
      .mockResolvedValueOnce({
        id: "user-message-1",
        conversationId: "conversation-1",
        role: "user",
        parts: [{ type: "text", text: "Create a contact" }],
        createdAt: new Date("2026-08-06T09:59:00.000Z"),
        sequence: 1n,
        turnRequestId: "turn-1",
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "assistant-message-1",
        conversationId: "conversation-1",
        role: "assistant",
        parts: [{ type: "text", text: "Done" }],
        createdAt: now,
        sequence: 2n,
        turnRequestId: "turn-1",
      });
    prismaMock.agentTurnRequest.updateMany.mockResolvedValue({ count: 1 });

    const replay = await runWithTenant(user, () =>
      new PrismaAgentChatRepo().findAgentTurnRequestForAdmission("request-1", now, "claude-test"),
    );

    expect(replay?.snapshot).toMatchObject({
      status: "uncertain",
      assistantMessageId: "assistant-message-1",
      terminalCode: null,
    });
    expect(prismaMock.agentTurnRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: user.companyId, userId: user.id, clientRequestId: "request-1" },
      }),
    );
    expect(prismaMock.agentTurnRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "uncertain",
          assistantMessageId: "assistant-message-1",
          terminalCode: null,
        }),
      }),
    );
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
  });

  it("marks provider start only for the exact live tenant turn and run", async () => {
    const startedAt = new Date("2026-08-06T10:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(startedAt);
    prismaMock.agentRunLease.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.agentTurnRequest.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.findUnique.mockResolvedValue({
      id: user.id,
      companyId: user.companyId,
      status: Status.active,
      createdAt: new Date("2026-01-15T10:30:00.000Z"),
      agentCreditActivatedAt: new Date("2026-01-15T10:30:00.000Z"),
      company: {
        subscription: {
          status: "active",
          plan: "pro",
          trialEndDate: null,
          agentCreditAnchorAt: new Date("2026-01-15T10:30:00.000Z"),
          enterpriseAgentCreditsPerUser: null,
          createdAt: new Date("2026-01-15T10:30:00.000Z"),
        },
      },
    });
    prismaMock.agentUsageEvent.findFirst.mockResolvedValue({ reservedCredits: 5 });
    prismaMock.agentUsageEvent.findMany.mockResolvedValue([]);
    prismaMock.agentUsageEvent.updateMany.mockResolvedValue({ count: 1 });

    try {
      await new PrismaAgentChatRepo().markAgentTurnProviderStartedUnscoped({
        turnRequestId: "turn-1",
        conversationId: "conversation-1",
        companyId: user.companyId,
        userId: user.id,
        runId: "run-1",
      });
    } finally {
      vi.useRealTimers();
    }

    expect(prismaMock.agentRunLease.updateMany).toHaveBeenCalledWith({
      where: {
        companyId: user.companyId,
        userId: user.id,
        runId: "run-1",
        expiresAt: { gt: startedAt },
      },
      data: { expiresAt: new Date("2026-08-06T10:05:30.000Z") },
    });
    expect(prismaMock.agentTurnRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: "turn-1",
        conversationId: "conversation-1",
        companyId: user.companyId,
        userId: user.id,
        runId: "run-1",
        status: "running",
        providerStartedAt: null,
      },
      data: { providerStartedAt: startedAt },
    });
    expect(prismaMock.agentUsageEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: "run-1",
        companyId: user.companyId,
        userId: user.id,
        state: "reserved",
        providerStartedAt: null,
      },
      data: {
        providerStartedAt: startedAt,
        planSnapshot: "pro",
        subscriptionStatusSnapshot: "active",
        allowanceCreditsSnapshot: 500,
        periodStart: new Date("2026-07-15T10:30:00.000Z"),
        periodEnd: new Date("2026-08-15T10:30:00.000Z"),
      },
    });
  });

  it.each([Status.inactive, Status.pendingAuthorization])(
    "fails provider start before the model call when the paid seat is %s",
    async (status) => {
      prismaMock.agentRunLease.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.user.findUnique.mockResolvedValue({
        id: user.id,
        companyId: user.companyId,
        status,
        createdAt: new Date("2026-01-15T10:30:00.000Z"),
        agentCreditActivatedAt: null,
        company: {
          subscription: {
            status: "active",
            plan: "pro",
            trialEndDate: null,
            agentCreditAnchorAt: new Date("2026-01-15T10:30:00.000Z"),
            enterpriseAgentCreditsPerUser: null,
            createdAt: new Date("2026-01-15T10:30:00.000Z"),
          },
        },
      });

      await expect(
        new PrismaAgentChatRepo().markAgentTurnProviderStartedUnscoped({
          turnRequestId: "turn-1",
          conversationId: "conversation-1",
          companyId: user.companyId,
          userId: user.id,
          runId: "run-1",
        }),
      ).rejects.toThrow("not an active seat");

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: user.id },
          select: expect.objectContaining({ status: true }),
        }),
      );
      expect(prismaMock.agentUsageEvent.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.agentTurnRequest.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.agentUsageEvent.updateMany).not.toHaveBeenCalled();
    },
  );

  it("fails provider start before the model call when the exact lease is absent", async () => {
    prismaMock.agentRunLease.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      new PrismaAgentChatRepo().markAgentTurnProviderStartedUnscoped({
        turnRequestId: "turn-1",
        conversationId: "conversation-1",
        companyId: user.companyId,
        userId: user.id,
        runId: "run-1",
      }),
    ).rejects.toThrow("lease expired");
    expect(prismaMock.agentTurnRequest.updateMany).not.toHaveBeenCalled();
  });

  it("samples provider ownership after acquiring the company lock", async () => {
    const acquiredAt = new Date("2026-08-06T10:00:02.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T10:00:00.000Z"));
    prismaMock.$executeRaw.mockImplementationOnce(() => {
      vi.setSystemTime(acquiredAt);
      return Promise.resolve();
    });
    prismaMock.agentRunLease.updateMany.mockResolvedValue({ count: 0 });

    try {
      await expect(
        new PrismaAgentChatRepo().markAgentTurnProviderStartedUnscoped({
          turnRequestId: "turn-1",
          conversationId: "conversation-1",
          companyId: user.companyId,
          userId: user.id,
          runId: "run-1",
        }),
      ).rejects.toThrow("lease expired");
    } finally {
      vi.useRealTimers();
    }

    expect(prismaMock.agentRunLease.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ expiresAt: { gt: acquiredAt } }),
      }),
    );
    expect(prismaMock.agentTurnRequest.updateMany).not.toHaveBeenCalled();
  });

  it("atomically fences usage, canonical reply, archived conversation, turn, and lease finalization", async () => {
    const completedAt = new Date("2026-08-06T10:01:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(completedAt);
    prismaMock.agentTurnRequest.findFirst.mockResolvedValue(
      storedTurn({ providerStartedAt: new Date("2026-08-06T10:00:00.000Z") }),
    );
    prismaMock.agentRunLease.findFirst.mockResolvedValue({
      runId: "run-1",
      expiresAt: new Date("2026-08-06T10:05:00.000Z"),
    });
    prismaMock.agentConversation.findFirst.mockResolvedValue({ updatedAt: new Date("2026-08-06T10:00:00.000Z") });
    prismaMock.agentUsageEvent.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.agentMessage.create.mockResolvedValue({
      id: "assistant-message-1",
      parts: [{ type: "text", text: "Done" }],
      createdAt: completedAt,
    });
    prismaMock.agentConversation.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.agentTurnRequest.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.agentRunLease.deleteMany.mockResolvedValue({ count: 1 });

    const result = await (async () => {
      try {
        return await new PrismaAgentChatRepo().finalizeAgentTurnOrThrowUnscoped({
          turnRequestId: "turn-1",
          conversationId: "conversation-1",
          companyId: user.companyId,
          userId: user.id,
          runId: "run-1",
          parts: [{ type: "text", text: "Done" }],
          terminalCode: "completed",
          affectedResources: ["contacts"],
          usageSettlement: {
            model: "claude-test",
            inputTokens: 100,
            outputTokens: 20,
            cacheReadTokens: 5,
            cacheWriteTokens: 2,
            costMicrocents: 123,
            reservedCredits: 1,
            chargedCredits: 1,
            state: "settled",
            policyBreach: false,
          },
        });
      } finally {
        vi.useRealTimers();
      }
    })();

    expect(result).toMatchObject({
      assistantMessage: { id: "assistant-message-1" },
      terminalCode: "completed",
      affectedResources: ["contacts"],
      costMicrocents: 123,
    });
    expect(prismaMock.agentUsageEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: "run-1",
        companyId: user.companyId,
        userId: user.id,
        state: "reserved",
        reservedCredits: 1,
      },
      data: {
        state: "settled",
        model: "claude-test",
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 5,
        cacheWriteTokens: 2,
        costMicrocents: 123,
        chargedCredits: 1,
        policyBreach: false,
        settledAt: completedAt,
      },
    });
    expect(prismaMock.agentConversation.updateMany).toHaveBeenCalledWith({
      where: { id: "conversation-1", companyId: user.companyId, userId: user.id, archivedAt: null },
      data: { updatedAt: completedAt },
    });
    expect(prismaMock.agentTurnRequest.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "turn-1",
        conversationId: "conversation-1",
        companyId: user.companyId,
        userId: user.id,
        runId: "run-1",
        status: "running",
      },
      data: {
        status: "completed",
        assistantMessageId: "assistant-message-1",
        terminalCode: "completed",
        affectedResources: ["contacts"],
        terminalAt: completedAt,
      },
    });
    expect(prismaMock.agentRunLease.deleteMany).toHaveBeenCalledWith({
      where: { companyId: user.companyId, userId: user.id, runId: "run-1" },
    });
  });

  it("rejects finalization when settlement does not match durable provider-start evidence", async () => {
    prismaMock.agentTurnRequest.findFirst.mockResolvedValue(storedTurn());

    await expect(
      new PrismaAgentChatRepo().finalizeAgentTurnOrThrowUnscoped({
        turnRequestId: "turn-1",
        conversationId: "conversation-1",
        companyId: user.companyId,
        userId: user.id,
        runId: "run-1",
        parts: [{ type: "text", text: "Done" }],
        terminalCode: "completed",
        affectedResources: [],
        usageSettlement: {
          model: "claude-test",
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costMicrocents: 1,
          reservedCredits: 1,
          chargedCredits: 1,
          state: "settled",
          policyBreach: false,
        },
      }),
    ).rejects.toThrow("provider-start evidence");
    expect(prismaMock.agentUsageEvent.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.agentMessage.create).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean budget-policy marker at the finalization boundary", async () => {
    await expect(
      new PrismaAgentChatRepo().finalizeAgentTurnOrThrowUnscoped({
        turnRequestId: "turn-1",
        conversationId: "conversation-1",
        companyId: user.companyId,
        userId: user.id,
        runId: "run-1",
        parts: [{ type: "text", text: "Done" }],
        terminalCode: "completed",
        affectedResources: [],
        usageSettlement: {
          model: "claude-test",
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costMicrocents: 1,
          reservedCredits: 1,
          chargedCredits: 1,
          state: "settled",
          policyBreach: "yes" as never,
        },
      }),
    ).rejects.toThrow("usage settlement is invalid");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("persists only client-safe canonical parts and never moves conversation time backward", async () => {
    const currentTime = new Date("2026-08-06T10:00:00.000Z");
    const existingConversationTime = new Date("2026-08-06T10:02:00.000Z");
    const internalId = "00000000-0000-4000-8000-000000000777";
    vi.useFakeTimers();
    vi.setSystemTime(currentTime);
    prismaMock.agentTurnRequest.findFirst.mockResolvedValue(storedTurn());
    prismaMock.agentRunLease.findFirst.mockResolvedValue({
      runId: "run-1",
      expiresAt: new Date("2026-08-06T10:05:00.000Z"),
    });
    prismaMock.agentConversation.findFirst.mockResolvedValue({ updatedAt: existingConversationTime });
    prismaMock.agentUsageEvent.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.agentMessage.create.mockResolvedValue({
      id: "assistant-message-1",
      parts: [],
      createdAt: existingConversationTime,
    });
    prismaMock.agentConversation.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.agentTurnRequest.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.agentRunLease.deleteMany.mockResolvedValue({ count: 1 });

    try {
      await new PrismaAgentChatRepo().finalizeAgentTurnOrThrowUnscoped({
        turnRequestId: "turn-1",
        conversationId: "conversation-1",
        companyId: user.companyId,
        userId: user.id,
        runId: "run-1",
        parts: [
          { type: "text", text: `<page_context route="/en/contacts"/>Opened ${internalId}.` },
          {
            type: "tool_use",
            id: "tool-1",
            name: "list_records",
            input: { entity: "contact", accountId: internalId },
          },
        ],
        terminalCode: "completed",
        affectedResources: [],
        usageSettlement: null,
      });
    } finally {
      vi.useRealTimers();
    }

    const createArgs = prismaMock.agentMessage.create.mock.calls.at(-1)?.[0] as {
      data: { parts: unknown; createdAt: Date };
    };
    expect(createArgs.data.parts).toEqual([
      { type: "text", text: "Opened [internal reference]." },
      expect.objectContaining({ type: "activity", id: "tool-1", status: "done" }),
    ]);
    expect(JSON.stringify(createArgs.data.parts)).not.toContain(internalId);
    expect(JSON.stringify(createArgs.data.parts)).not.toContain("page_context");
    expect(JSON.stringify(createArgs.data.parts)).not.toContain("tool_use");
    expect(createArgs.data.createdAt).toEqual(existingConversationTime);
    expect(prismaMock.agentConversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { updatedAt: existingConversationTime } }),
    );
  });

  it("rejects a canonical reply that becomes blank after client-safe sanitization", async () => {
    await expect(
      new PrismaAgentChatRepo().finalizeAgentTurnOrThrowUnscoped({
        turnRequestId: "turn-1",
        conversationId: "conversation-1",
        companyId: user.companyId,
        userId: user.id,
        runId: "run-1",
        parts: [{ type: "text", text: '<page_context route="/en/contacts"/>' }],
        terminalCode: "completed",
        affectedResources: [],
        usageSettlement: null,
      }),
    ).rejects.toThrow("canonical reply is not renderable");
    expect(prismaMock.agentTurnRequest.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.agentMessage.create).not.toHaveBeenCalled();
  });

  it("releases stale pre-provider reservations and makes only that turn retryable", async () => {
    const now = new Date("2026-08-06T10:10:00.000Z");
    prismaMock.agentRunLease.findFirst.mockResolvedValue({
      runId: "run-1",
      expiresAt: new Date("2026-08-06T10:00:00.000Z"),
    });
    prismaMock.agentTurnRequest.findFirst.mockResolvedValue(storedTurn());
    prismaMock.agentUsageEvent.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.agentTurnRequest.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.agentRunLease.deleteMany.mockResolvedValue({ count: 1 });

    await runWithTenant(user, () => new PrismaAgentChatRepo().normalizeExpiredAgentRunLease(now, "claude-test"));

    expect(prismaMock.agentUsageEvent.updateMany).toHaveBeenCalledWith({
      where: { id: "run-1", companyId: user.companyId, userId: user.id, state: "reserved" },
      data: { state: "released", chargedCredits: 0, settledAt: now },
    });
    expect(prismaMock.agentTurnRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "failed", terminalAt: now }) }),
    );
  });

  it("conservatively settles stale post-provider reservations and marks the turn uncertain", async () => {
    const now = new Date("2026-08-06T10:10:00.000Z");
    prismaMock.agentRunLease.findFirst.mockResolvedValue({
      runId: "run-1",
      expiresAt: new Date("2026-08-06T10:00:00.000Z"),
    });
    prismaMock.agentTurnRequest.findFirst.mockResolvedValue(
      storedTurn({ providerStartedAt: new Date("2026-08-06T09:59:00.000Z") }),
    );
    prismaMock.agentUsageEvent.findFirst.mockResolvedValue({ reservedCredits: 7 });
    prismaMock.agentUsageEvent.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.agentTurnRequest.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.agentRunLease.deleteMany.mockResolvedValue({ count: 1 });

    await runWithTenant(user, () => new PrismaAgentChatRepo().normalizeExpiredAgentRunLease(now, "claude-test"));

    expect(prismaMock.agentUsageEvent.updateMany).toHaveBeenCalledWith({
      where: { id: "run-1", companyId: user.companyId, userId: user.id, state: "reserved" },
      data: {
        state: "retained",
        model: "claude-test",
        chargedCredits: 7,
        settledAt: now,
      },
    });
    expect(prismaMock.agentTurnRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "uncertain", terminalAt: now }) }),
    );
  });

  it("fences lease release to the run that claimed it", async () => {
    await new PrismaAgentChatRepo().releaseAgentRunLeaseUnscoped({
      userId: user.id,
      companyId: user.companyId,
      runId: "run-2",
    });

    expect(prismaMock.agentRunLease.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        companyId: user.companyId,
        runId: "run-2",
      },
    });
  });

  it("rechecks the active seat and current entitlement while reserving credits", async () => {
    const reservedAt = new Date("2026-08-06T10:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(reservedAt);
    prismaMock.user.findUnique.mockResolvedValue({
      id: user.id,
      companyId: user.companyId,
      status: Status.active,
      createdAt: new Date("2026-01-15T10:30:00.000Z"),
      agentCreditActivatedAt: new Date("2026-01-15T10:30:00.000Z"),
      company: {
        subscription: {
          status: "active",
          plan: "pro",
          trialEndDate: null,
          agentCreditAnchorAt: new Date("2026-01-15T10:30:00.000Z"),
          enterpriseAgentCreditsPerUser: null,
          createdAt: new Date("2026-01-15T10:30:00.000Z"),
        },
      },
    });
    prismaMock.agentUsageEvent.findMany.mockResolvedValue([
      { state: "settled", reservedCredits: 0, chargedCredits: 495 },
    ]);

    try {
      await expect(
        new PrismaAgentChatRepo().reserveUsageEventUnscoped({
          id: "run-stale-plan",
          companyId: user.companyId,
          userId: user.id,
          sessionId: "run-stale-plan",
          reservedCredits: 6,
          planSnapshot: "business",
          subscriptionStatusSnapshot: "active",
          allowanceCreditsSnapshot: 1200,
          periodStart: new Date("2026-08-01T00:00:00.000Z"),
          periodEnd: new Date("2026-09-01T00:00:00.000Z"),
        }),
      ).rejects.toThrow("current allowance");
    } finally {
      vi.useRealTimers();
    }

    expect(prismaMock.agentUsageEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: user.id,
          periodStart: new Date("2026-07-15T10:30:00.000Z"),
          periodEnd: new Date("2026-08-15T10:30:00.000Z"),
        }),
      }),
    );
    expect(prismaMock.agentUsageEvent.create).not.toHaveBeenCalled();
  });

  it("releases only a matching reserved usage event without deleting its billing record", async () => {
    const releasedAt = new Date("2026-08-10T00:00:00.000Z");
    await new PrismaAgentChatRepo().releaseUsageReservationUnscoped({
      id: "run-2",
      userId: user.id,
      companyId: user.companyId,
      releasedAt,
    });

    expect(prismaMock.agentUsageEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: "run-2",
        userId: user.id,
        companyId: user.companyId,
        state: "reserved",
      },
      data: { state: "released", chargedCredits: 0, settledAt: releasedAt },
    });
  });

  it("settles only the matching user's pending reservation", async () => {
    const settledAt = new Date("2026-08-10T00:00:01.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(settledAt);
    prismaMock.agentUsageEvent.updateMany.mockResolvedValue({ count: 1 });

    try {
      await new PrismaAgentChatRepo().recordUsageEventUnscoped({
        id: "run-2",
        companyId: user.companyId,
        userId: user.id,
        sessionId: "run-2",
        model: "gpt-5.6-luna",
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costMicrocents: 123,
        chargedCredits: 1,
        state: "settled",
        policyBreach: false,
        settledAt,
      });
    } finally {
      vi.useRealTimers();
    }

    expect(prismaMock.agentUsageEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: "run-2",
        companyId: user.companyId,
        userId: user.id,
        state: "reserved",
      },
      data: {
        companyId: user.companyId,
        userId: user.id,
        sessionId: "run-2",
        model: "gpt-5.6-luna",
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costMicrocents: 123,
        chargedCredits: 1,
        state: "settled",
        policyBreach: false,
        settledAt,
      },
    });
  });

  it("fails closed when a reservation was already settled or belongs to someone else", async () => {
    prismaMock.agentUsageEvent.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      new PrismaAgentChatRepo().recordUsageEventUnscoped({
        id: "run-2",
        companyId: user.companyId,
        userId: user.id,
        sessionId: "run-2",
        model: "gpt-5.6-luna",
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costMicrocents: 123,
        chargedCredits: 1,
        state: "settled",
        policyBreach: false,
        settledAt: new Date("2026-08-10T00:00:01.000Z"),
      }),
    ).rejects.toThrow("could not be settled");
  });
});
