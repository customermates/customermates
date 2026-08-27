import { describe, expect, it, vi } from "vitest";

import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUserWithPermissions([]);

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env, APP_MODE: "cloud" as const } }));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), setTag: vi.fn(), setUser: vi.fn() }));

import { ArchiveAgentConversationInteractor } from "../archive-agent-conversation.interactor";

const CONVERSATION_ID = "00000000-0000-4000-8000-000000000001";
const SELECTED_CONVERSATION_ID = "00000000-0000-4000-8000-000000000002";

describe("agent conversation history", () => {
  it("falls back to the persistently selected chat after archiving instead of the newest updated row", async () => {
    const newestUpdated = {
      id: "00000000-0000-4000-8000-000000000003",
      title: "Newest update",
      preview: "",
      updatedAt: new Date("2026-08-06T12:00:00.000Z"),
    };
    const repo = {
      archiveConversation: vi.fn().mockResolvedValue(true),
      listConversationPage: vi.fn().mockResolvedValue({
        conversations: [newestUpdated],
        nextCursor: null,
      }),
      findMyConversation: vi.fn().mockResolvedValue({ id: SELECTED_CONVERSATION_ID }),
    };

    const result = await new ArchiveAgentConversationInteractor(repo as never, mockEntitlementService()).invoke({
      conversationId: CONVERSATION_ID,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        activeConversationId: SELECTED_CONVERSATION_ID,
        conversations: [newestUpdated],
        nextCursor: null,
      },
    });
    expect(repo.findMyConversation).toHaveBeenCalledOnce();
  });
});
