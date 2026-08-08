import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { CreateSupportTicketInteractor } from "../create-support-ticket.interactor";

describe("CreateSupportTicketInteractor", () => {
  let repo: any;
  let emailService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = { createSupportTicketOrThrow: vi.fn().mockResolvedValue({ id: "t1", number: 7, created: true }) };
    emailService = { send: vi.fn().mockResolvedValue(undefined) };
  });

  it("creates a ticket and escalates it by email", async () => {
    const result: any = await new CreateSupportTicketInteractor(repo, emailService).invoke({
      subject: "Cannot import contacts",
      body: "The CSV importer errors on line 3.",
      source: "mcp",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ id: "t1", number: 7 });
    expect(repo.createSupportTicketOrThrow).toHaveBeenCalledWith({
      subject: "Cannot import contacts",
      body: "The CSV importer errors on line 3.",
      source: "mcp",
    });
    expect(emailService.send).toHaveBeenCalledTimes(1);
  });

  it("returns the same ticket without sending a second email for an idempotent retry", async () => {
    const idempotencyId = "00000000-0000-8000-8000-000000000001";
    repo.createSupportTicketOrThrow
      .mockResolvedValueOnce({ id: idempotencyId, number: 7, created: true })
      .mockResolvedValueOnce({ id: idempotencyId, number: 7, created: false });
    const interactor = new CreateSupportTicketInteractor(repo, emailService);
    const input = {
      subject: "Cannot import contacts",
      body: "The CSV importer errors on line 3.",
      source: "chat" as const,
      idempotencyId,
    };

    const first: any = await interactor.invoke(input);
    const retried: any = await interactor.invoke(input);

    expect(first).toEqual({ ok: true, data: { id: idempotencyId, number: 7 } });
    expect(retried).toEqual(first);
    expect(emailService.send).toHaveBeenCalledTimes(1);
  });

  it("keeps the originating hosted chat correlation internal to ticket persistence", async () => {
    const agentConversationId = "00000000-0000-4000-8000-000000000099";

    const result: any = await new CreateSupportTicketInteractor(repo, emailService).invoke({
      subject: "Need a human",
      body: "Please review this conversation.",
      source: "chat",
      agentConversationId,
    });

    expect(result.ok).toBe(true);
    expect(repo.createSupportTicketOrThrow).toHaveBeenCalledWith({
      subject: "Need a human",
      body: "Please review this conversation.",
      source: "chat",
      agentConversationId,
    });
  });

  it("rejects an internal chat correlation on an MCP ticket", async () => {
    const result: any = await new CreateSupportTicketInteractor(repo, emailService).invoke({
      subject: "Need a human",
      body: "Please review this conversation.",
      source: "mcp",
      agentConversationId: "00000000-0000-4000-8000-000000000099",
    });

    expect(result.ok).toBe(false);
    expect(repo.createSupportTicketOrThrow).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it("rejects an empty subject without creating a ticket", async () => {
    const result: any = await new CreateSupportTicketInteractor(repo, emailService).invoke({
      subject: "",
      body: "some body",
      source: "mcp",
    });

    expect(result.ok).toBe(false);
    expect(repo.createSupportTicketOrThrow).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });
});
