import { describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve({ raw: (key: string) => key }),
}));
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { CreateChatSupportTicketInteractor } from "../create-chat-support-ticket.interactor";

const conversationId = "00000000-0000-4000-8000-000000000001";

describe("CreateChatSupportTicketInteractor", () => {
  it("emails the support details with the recent Assistant transcript", async () => {
    const repo = {
      findConversation: vi.fn().mockResolvedValue({ id: conversationId }),
      listRecentMessages: vi.fn().mockResolvedValue([
        {
          role: "user",
          parts: [{ type: "text", text: "Import keeps failing" }],
        },
      ]),
    };
    const feedbackCreator = { create: vi.fn().mockResolvedValue(undefined) };

    const result = await new CreateChatSupportTicketInteractor(repo as never, feedbackCreator as never).invoke({
      conversationId,
      subject: "Need a human",
      body: "Please help with this import error.",
    });

    expect(result).toEqual({ ok: true, data: { sent: true } });
    expect(feedbackCreator.create).toHaveBeenCalledWith({
      details: "Please help with this import error.\n\nRecent Assistant conversation:\nuser: Import keeps failing",
      subject: "Support request: Need a human",
      user: mockUser,
    });
    expect(repo.listRecentMessages).toHaveBeenCalledWith(conversationId, 20);
  });

  it("does not send an email for an inaccessible conversation", async () => {
    const repo = {
      findConversation: vi.fn().mockResolvedValue(null),
      listRecentMessages: vi.fn(),
    };
    const feedbackCreator = { create: vi.fn() };

    const result = await new CreateChatSupportTicketInteractor(repo as never, feedbackCreator as never).invoke({
      conversationId,
      subject: "Need a human",
      body: "Please help with this import error.",
    });
    expect(result).toMatchObject({
      ok: false,
      error: { issues: [{ params: { error: "agentConversationNotFound" } }] },
    });
    expect(repo.listRecentMessages).not.toHaveBeenCalled();
    expect(feedbackCreator.create).not.toHaveBeenCalled();
  });

  it("propagates a rejected support email", async () => {
    const repo = {
      findConversation: vi.fn().mockResolvedValue({ id: conversationId }),
      listRecentMessages: vi.fn().mockResolvedValue([]),
    };
    const feedbackCreator = {
      create: vi.fn().mockRejectedValue(new Error("Resend rejected the email")),
    };

    await expect(
      new CreateChatSupportTicketInteractor(repo as never, feedbackCreator as never).invoke({
        conversationId,
        subject: "Need a human",
        body: "Please help with this import error.",
      }),
    ).rejects.toThrow("Resend rejected the email");
  });
});
