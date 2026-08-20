import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("email-only support requests", () => {
  const feedbackCreator = { create: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    feedbackCreator.create.mockResolvedValue(undefined);
  });

  it("sends the request through the shared feedback creator", async () => {
    const result = await new CreateSupportTicketInteractor(feedbackCreator as never).invoke({
      subject: "Cannot import contacts",
      body: "The CSV importer errors on line 3.",
    });

    expect(result).toEqual({ ok: true, data: { sent: true } });
    expect(feedbackCreator.create).toHaveBeenCalledWith({
      details: "The CSV importer errors on line 3.",
      subject: "Support request: Cannot import contacts",
      user: mockUser,
    });
  });

  it("does not convert a failed email into a success response", async () => {
    feedbackCreator.create.mockRejectedValueOnce(new Error("Resend rejected the email"));

    await expect(
      new CreateSupportTicketInteractor(feedbackCreator as never).invoke({
        subject: "Cannot import contacts",
        body: "The CSV importer errors on line 3.",
      }),
    ).rejects.toThrow("Resend rejected the email");
  });

  it("rejects an empty subject without sending an email", async () => {
    const result = await new CreateSupportTicketInteractor(feedbackCreator as never).invoke({
      subject: "",
      body: "some body",
    });

    expect(result.ok).toBe(false);
    expect(feedbackCreator.create).not.toHaveBeenCalled();
  });
});
