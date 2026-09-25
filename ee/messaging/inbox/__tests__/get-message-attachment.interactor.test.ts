import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const routeInteractor = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getGetMessageAttachmentInteractor: () => routeInteractor.current,
}));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { GetMessageAttachmentInteractor } from "../get-message-attachment.interactor";
import { GET } from "@/app/api/messaging/attachments/[messageId]/[attachmentId]/route";

function build() {
  const repo = { findAttachmentForMessageOrThrow: vi.fn() };
  const messagingService = { downloadAttachment: vi.fn() };
  const interactor = new GetMessageAttachmentInteractor(repo, messagingService as never, mockEntitlementService());
  return { interactor, repo, messagingService };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GetMessageAttachmentInteractor", () => {
  it("returns a validation failure for a malformed message id instead of throwing", async () => {
    const { interactor, repo, messagingService } = build();

    const result = await interactor.invoke({ messageId: "abc123", attachmentId: "def456" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues[0]).toMatchObject({ path: ["messageId"], format: "uuid" });
    expect(repo.findAttachmentForMessageOrThrow).not.toHaveBeenCalled();
    expect(messagingService.downloadAttachment).not.toHaveBeenCalled();
  });

  it("answers a malformed message id on the attachment route with HTTP 400", async () => {
    const { interactor, repo } = build();
    routeInteractor.current = interactor;

    const response = await GET(new NextRequest("http://localhost:4105/api/messaging/attachments/abc123/def456"), {
      params: Promise.resolve({ messageId: "abc123", attachmentId: "def456" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toBe("✖ Invalid UUID\n  → at messageId");
    expect(repo.findAttachmentForMessageOrThrow).not.toHaveBeenCalled();
  });
});
