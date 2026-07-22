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
import { ListSupportTicketsInteractor } from "../list-support-tickets.interactor";

describe("CreateSupportTicketInteractor", () => {
  let repo: any;
  let emailService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = { createSupportTicket: vi.fn().mockResolvedValue({ id: "t1", number: 7 }) };
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
    expect(repo.createSupportTicket).toHaveBeenCalledWith({
      subject: "Cannot import contacts",
      body: "The CSV importer errors on line 3.",
      source: "mcp",
    });
    expect(emailService.send).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty subject without creating a ticket", async () => {
    const result: any = await new CreateSupportTicketInteractor(repo, emailService).invoke({
      subject: "",
      body: "some body",
      source: "mcp",
    });

    expect(result.ok).toBe(false);
    expect(repo.createSupportTicket).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });
});

describe("ListSupportTicketsInteractor", () => {
  it("returns the current user's tickets from the repository", async () => {
    const tickets = [
      { number: 7, subject: "s", status: "open", source: "mcp", createdAt: new Date(), resolvedAt: null },
    ];
    const repo: any = { listMySupportTickets: vi.fn().mockResolvedValue(tickets) };

    const result: any = await new ListSupportTicketsInteractor(repo).invoke();

    expect(result.ok).toBe(true);
    expect(result.data).toBe(tickets);
    expect(repo.listMySupportTickets).toHaveBeenCalledTimes(1);
  });
});
