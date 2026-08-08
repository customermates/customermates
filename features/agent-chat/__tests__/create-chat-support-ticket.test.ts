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
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { CreateChatSupportTicketInteractor } from "../create-chat-support-ticket.interactor";
import { deriveChatSupportTicketId } from "../agent-support-ticket-idempotency";

const conversationId = "00000000-0000-4000-8000-000000000001";
const turnRequestId = "00000000-0000-4000-8000-000000000002";

describe("CreateChatSupportTicketInteractor", () => {
  it("derives the repository idempotency id from the admitted turn and provider tool call", async () => {
    const repo = {
      findConversation: vi.fn().mockResolvedValue({ id: conversationId }),
      listRecentMessages: vi.fn(),
    };
    const createSupportTicket = {
      invoke: vi.fn().mockResolvedValue({
        ok: true,
        data: { id: "ticket-id", number: 12 },
      }),
    };

    const result = await new CreateChatSupportTicketInteractor(repo as never, createSupportTicket as never).invoke({
      conversationId,
      turnRequestId,
      toolCallId: "call_request_support_1",
      subject: "Need a human",
      body: "Please help with this import error.",
    });

    expect(result).toEqual({ ok: true, data: { id: "ticket-id", number: 12 } });
    expect(createSupportTicket.invoke).toHaveBeenCalledWith({
      subject: "Need a human",
      body: "Please help with this import error.",
      source: "chat",
      agentConversationId: conversationId,
      idempotencyId: deriveChatSupportTicketId({
        turnRequestId,
        toolCallId: "call_request_support_1",
      }),
    });
    expect(repo.listRecentMessages).not.toHaveBeenCalled();
  });
});
