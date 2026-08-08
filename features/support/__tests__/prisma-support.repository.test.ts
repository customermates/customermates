import { beforeEach, describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";

const prismaMock = vi.hoisted(() => ({
  supportTicket: {
    create: vi.fn(),
    findFirst: vi.fn(),
  },
  agentConversation: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/prisma/db", () => ({ prisma: prismaMock }));

import { PrismaSupportRepo } from "../prisma-support.repository";

const user = createMockUser();
const idempotencyId = "00000000-0000-8000-8000-000000000001";

describe("PrismaSupportRepo idempotent creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the tenant-owned existing ticket after a duplicate create loses the race", async () => {
    const duplicateError = new Error("unique constraint");
    prismaMock.supportTicket.create.mockRejectedValue(duplicateError);
    prismaMock.supportTicket.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: idempotencyId, number: 42 });

    const result = await runWithTenant(user, () =>
      new PrismaSupportRepo().createSupportTicketOrThrow({
        subject: "Need help",
        body: "Please connect me with a human.",
        source: "chat",
        idempotencyId,
      }),
    );

    expect(result).toEqual({ id: idempotencyId, number: 42, created: false });
    expect(prismaMock.supportTicket.findFirst).toHaveBeenCalledWith({
      where: {
        id: idempotencyId,
        companyId: user.companyId,
        userId: user.id,
      },
      select: { id: true, number: true },
    });
  });

  it("rethrows a failed create when the deterministic id does not belong to this tenant", async () => {
    const createError = new Error("database unavailable");
    prismaMock.supportTicket.create.mockRejectedValue(createError);
    prismaMock.supportTicket.findFirst.mockResolvedValue(null);

    await expect(
      runWithTenant(user, () =>
        new PrismaSupportRepo().createSupportTicketOrThrow({
          subject: "Need help",
          body: "Please connect me with a human.",
          source: "chat",
          idempotencyId,
        }),
      ),
    ).rejects.toBe(createError);
  });

  it("preserves normal non-idempotent ticket creation", async () => {
    prismaMock.supportTicket.create.mockResolvedValue({ id: "random-ticket", number: 43 });

    const result = await runWithTenant(user, () =>
      new PrismaSupportRepo().createSupportTicketOrThrow({
        subject: "Need help",
        body: "Please connect me with a human.",
        source: "mcp",
      }),
    );

    expect(result).toEqual({ id: "random-ticket", number: 43, created: true });
    expect(prismaMock.supportTicket.create).toHaveBeenCalledWith({
      data: {
        companyId: user.companyId,
        userId: user.id,
        subject: "Need help",
        body: "Please connect me with a human.",
        source: "mcp",
        agentConversationId: null,
      },
      select: { id: true, number: true },
    });
    expect(prismaMock.supportTicket.findFirst).not.toHaveBeenCalled();
  });

  it("persists an optional hosted Assistant conversation correlation", async () => {
    const agentConversationId = "00000000-0000-4000-8000-000000000099";
    prismaMock.agentConversation.findFirst.mockResolvedValue({ id: agentConversationId });
    prismaMock.supportTicket.create.mockResolvedValue({ id: "chat-ticket", number: 44 });

    await runWithTenant(user, () =>
      new PrismaSupportRepo().createSupportTicketOrThrow({
        subject: "Need a human",
        body: "Please review this conversation.",
        source: "chat",
        agentConversationId,
      }),
    );

    expect(prismaMock.supportTicket.create).toHaveBeenCalledWith({
      data: {
        companyId: user.companyId,
        userId: user.id,
        subject: "Need a human",
        body: "Please review this conversation.",
        source: "chat",
        agentConversationId,
      },
      select: { id: true, number: true },
    });
    expect(prismaMock.agentConversation.findFirst).toHaveBeenCalledWith({
      where: {
        id: agentConversationId,
        companyId: user.companyId,
        userId: user.id,
      },
      select: { id: true },
    });
  });

  it("rejects a conversation correlation outside the current tenant", async () => {
    const agentConversationId = "00000000-0000-4000-8000-000000000099";
    prismaMock.agentConversation.findFirst.mockResolvedValue(null);

    await expect(
      runWithTenant(user, () =>
        new PrismaSupportRepo().createSupportTicketOrThrow({
          subject: "Need a human",
          body: "Please review this conversation.",
          source: "chat",
          agentConversationId,
        }),
      ),
    ).rejects.toThrow("Hosted Assistant conversation not found");
    expect(prismaMock.supportTicket.create).not.toHaveBeenCalled();
  });

  it("returns an idempotent ticket before revalidating a deleted chat correlation", async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue({ id: idempotencyId, number: 45 });

    const result = await runWithTenant(user, () =>
      new PrismaSupportRepo().createSupportTicketOrThrow({
        subject: "Need a human",
        body: "Please review this conversation.",
        source: "chat",
        idempotencyId,
        agentConversationId: "00000000-0000-4000-8000-000000000099",
      }),
    );

    expect(result).toEqual({ id: idempotencyId, number: 45, created: false });
    expect(prismaMock.agentConversation.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.supportTicket.create).not.toHaveBeenCalled();
  });
});
