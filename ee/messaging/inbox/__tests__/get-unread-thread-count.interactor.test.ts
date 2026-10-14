import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { Action, Resource } from "@/generated/prisma";
import { ForbiddenError } from "@/core/errors/app-errors";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

let mockUser = createMockUserWithPermissions([]);

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));

import { GetUnreadThreadCountInteractor } from "../get-unread-thread-count.interactor";

const repo = { countUnreadThreadsForCurrentUser: vi.fn().mockResolvedValue(3) };
const requireMessaging = vi.fn().mockResolvedValue(null);
const entitlements = {
  require: requireMessaging,
} as unknown as EntitlementService;

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = createMockUserWithPermissions([]);
  repo.countUnreadThreadsForCurrentUser.mockResolvedValue(3);
  requireMessaging.mockResolvedValue(null);
});

describe("GetUnreadThreadCountInteractor", () => {
  it("denies users without inbox read access before counting", async () => {
    await expect(new GetUnreadThreadCountInteractor(repo, entitlements).invoke()).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(requireMessaging).not.toHaveBeenCalled();
    expect(repo.countUnreadThreadsForCurrentUser).not.toHaveBeenCalled();
  });

  it.each([Action.readOwn, Action.readAll])("counts for users with inbox %s access", async (action) => {
    mockUser = createMockUserWithPermissions([{ resource: Resource.inboxMessages, action }]);

    await expect(new GetUnreadThreadCountInteractor(repo, entitlements).invoke()).resolves.toEqual({
      ok: true,
      data: 3,
    });
    expect(requireMessaging).toHaveBeenCalledWith("messaging");
    expect(repo.countUnreadThreadsForCurrentUser).toHaveBeenCalledOnce();
  });

  it("does not count when the workspace lacks messaging entitlement", async () => {
    mockUser = createMockUserWithPermissions([{ resource: Resource.inboxMessages, action: Action.readOwn }]);
    const denied = {
      ok: false as const,
      code: "messagingRequiresPro" as const,
      error: new z.ZodError([]),
    };
    requireMessaging.mockResolvedValue(denied);

    await expect(new GetUnreadThreadCountInteractor(repo, entitlements).invoke()).resolves.toBe(denied);
    expect(repo.countUnreadThreadsForCurrentUser).not.toHaveBeenCalled();
  });
});
