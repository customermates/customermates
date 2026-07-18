import { describe, expect, it, vi } from "vitest";

import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";
import { createMockUser } from "@/tests/helpers/mock-user";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));

import { ResyncThreadInteractor } from "../resync-thread.interactor";

describe("ResyncThreadInteractor", () => {
  it("does not call Unipile for a synthetic thread", async () => {
    const repo = {
      findThreadForResyncOrThrow: vi.fn().mockResolvedValue({
        id: "17000000-0000-4000-8000-000000000001",
        unipileThreadId: "synthetic-thread-1",
        connectedAccountId: "16000000-0000-4000-8000-000000000001",
        synthetic: true,
        provider: "google",
        type: "single",
        companyId: mockUser.companyId,
        unipileAccountId: "synthetic-account-1",
        emailAddress: "max.bergmann@customermates.com",
        sentFolderIds: [],
      }),
    };
    const messagingService = {
      listChatMessages: vi.fn(),
      listChatParticipants: vi.fn(),
      listEmails: vi.fn(),
    };

    const result = await new ResyncThreadInteractor(
      repo as never,
      messagingService as never,
      mockEntitlementService(),
    ).invoke({ threadId: "17000000-0000-4000-8000-000000000001" });

    expect(result).toEqual({
      ok: true,
      data: { fetched: false, participantCount: 0, messageCount: 0 },
    });
    expect(messagingService.listChatMessages).not.toHaveBeenCalled();
    expect(messagingService.listChatParticipants).not.toHaveBeenCalled();
    expect(messagingService.listEmails).not.toHaveBeenCalled();
  });
});
