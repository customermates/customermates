import { beforeEach, describe, it, expect, vi } from "vitest";

import { Action, Resource, Status } from "@/generated/prisma";
import { ForbiddenError, isExpectedError, appErrorResponse } from "@/core/errors/app-errors";
import { ApiKeyAccessDeniedError } from "@/core/auth/api-key-access-denied-error";
import { WorkspacePlanRequiredError } from "@/core/auth/workspace-plan-required-error";
import { LAST_ACTIVE_RESOLUTION_MS, UserService } from "../user.service";
import type { FindUserRepo } from "../find-user.repo";
import type { AuthService } from "@/features/auth/auth.service";
import type { TenantUser } from "../user.schema";

type TestRole = { isSystemRole: boolean; permissions: { resource: Resource; action: Action }[] };

const API_READER: TestRole = { isSystemRole: false, permissions: [{ resource: Resource.api, action: Action.readAll }] };
const NO_API_ROLE: TestRole = { isSystemRole: false, permissions: [] };

const plans = { canUseIntegrations: vi.fn() };

const touchLastActiveUnscoped = vi.fn();

function serviceFor(
  status: Status,
  options: { apiKey?: boolean; role?: TestRole; planUsable?: boolean; lastActiveAt?: Date | null } = {},
) {
  const user = {
    id: "user-1",
    email: "someone@example.com",
    companyId: "company-1",
    status,
    role: options.role ?? NO_API_ROLE,
    lastActiveAt: options.lastActiveAt === undefined ? new Date() : options.lastActiveAt,
  } as unknown as TenantUser;
  const authService = {
    getSession: () => Promise.resolve({ user: { email: user.email } }),
    isIntegrationCredentialRequest: () => Promise.resolve(options.apiKey ?? false),
  } as unknown as AuthService;
  const repo = {
    findCurrentUserUnscoped: () => Promise.resolve(user),
    findCurrentUserOrThrowUnscoped: () => Promise.resolve(user),
    touchLastActiveUnscoped,
  } as unknown as FindUserRepo;

  plans.canUseIntegrations.mockResolvedValue(options.planUsable ?? true);

  return new UserService(authService, repo, { requireMembership: () => Promise.resolve(user) } as never, plans);
}

describe("UserService.getActiveUserOrThrow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses an API key or MCP token of a workspace that has no plan yet", async () => {
    const error = await serviceFor(Status.active, { apiKey: true, role: API_READER, planUsable: false })
      .getActiveUserOrThrow()
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(WorkspacePlanRequiredError);
    expect(appErrorResponse(error)?.statusCode).toBe(403);
    expect(plans.canUseIntegrations).toHaveBeenCalledWith("company-1");
  });

  it("does not check the plan for the browser session, which the page guard covers", async () => {
    await expect(serviceFor(Status.active, { planUsable: false }).getActiveUserOrThrow()).resolves.toMatchObject({
      id: "user-1",
    });
    expect(plans.canUseIntegrations).not.toHaveBeenCalled();
  });

  it("returns the user when the account is active", async () => {
    await expect(serviceFor(Status.active).getActiveUserOrThrow()).resolves.toMatchObject({ id: "user-1" });
  });

  it("rejects an inactive account as a forbidden request rather than an unexpected failure", async () => {
    const error = await serviceFor(Status.inactive)
      .getActiveUserOrThrow()
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(appErrorResponse(error)).toEqual({ message: "User is not active", statusCode: 403 });
    expect(isExpectedError(error)).toBe(true);
  });

  it("refuses an API key whose owner role lacks Read access All on API & Webhooks", async () => {
    const error = await serviceFor(Status.active, { apiKey: true })
      .getActiveUserOrThrow()
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ApiKeyAccessDeniedError);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(appErrorResponse(error)?.statusCode).toBe(403);
  });

  it("accepts an API key whose owner role can read API & Webhooks", async () => {
    await expect(
      serviceFor(Status.active, { apiKey: true, role: API_READER }).getActiveUserOrThrow(),
    ).resolves.toMatchObject({ id: "user-1" });
  });

  it("keeps session requests working without the API permission", async () => {
    await expect(serviceFor(Status.active).getActiveUserOrThrow()).resolves.toMatchObject({ id: "user-1" });
  });
});

describe("UserService last activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    touchLastActiveUnscoped.mockResolvedValue(undefined);
  });

  it("records activity of a member whose last activity is older than the resolution", async () => {
    const before = Date.now();
    await serviceFor(Status.active, {
      lastActiveAt: new Date(before - LAST_ACTIVE_RESOLUTION_MS - 1),
    }).getActiveUserOrThrow();

    expect(touchLastActiveUnscoped).toHaveBeenCalledTimes(1);
    const [userId, staleBefore] = touchLastActiveUnscoped.mock.calls[0] as [string, Date];
    expect(userId).toBe("user-1");
    expect(staleBefore.getTime()).toBeGreaterThanOrEqual(before - LAST_ACTIVE_RESOLUTION_MS);
  });

  it("records the first activity of a member who never had one, also through an API key", async () => {
    await serviceFor(Status.active, { lastActiveAt: null, apiKey: true, role: API_READER }).getActiveUserOrThrow();

    expect(touchLastActiveUnscoped).toHaveBeenCalledTimes(1);
  });

  it("writes nothing while the last activity is recent or the request is refused", async () => {
    await serviceFor(Status.active, { lastActiveAt: new Date() }).getActiveUserOrThrow();
    await serviceFor(Status.inactive, { lastActiveAt: null })
      .getActiveUserOrThrow()
      .catch(() => undefined);

    expect(touchLastActiveUnscoped).not.toHaveBeenCalled();
  });

  it("still serves the request when recording the activity fails", async () => {
    touchLastActiveUnscoped.mockRejectedValue(new Error("database unavailable"));

    await expect(serviceFor(Status.active, { lastActiveAt: null }).getActiveUserOrThrow()).resolves.toMatchObject({
      id: "user-1",
    });
  });
});
