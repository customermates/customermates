import { describe, it, expect } from "vitest";

import { Action, Resource, Status } from "@/generated/prisma";
import { ForbiddenError, isExpectedError, appErrorResponse } from "@/core/errors/app-errors";
import { ApiKeyAccessDeniedError } from "@/core/auth/api-key-access-denied-error";
import { UserService } from "../user.service";
import type { FindUserRepo } from "../find-user.repo";
import type { AuthService } from "@/features/auth/auth.service";
import type { TenantUser } from "../user.schema";

type TestRole = { isSystemRole: boolean; permissions: { resource: Resource; action: Action }[] };

const API_READER: TestRole = { isSystemRole: false, permissions: [{ resource: Resource.api, action: Action.readAll }] };
const NO_API_ROLE: TestRole = { isSystemRole: false, permissions: [] };

function serviceFor(status: Status, options: { apiKey?: boolean; role?: TestRole } = {}) {
  const user = {
    id: "user-1",
    email: "someone@example.com",
    status,
    role: options.role ?? NO_API_ROLE,
  } as unknown as TenantUser;
  const authService = {
    getSession: () => Promise.resolve({ user: { email: user.email } }),
    isApiKeyRequest: () => Promise.resolve(options.apiKey ?? false),
  } as unknown as AuthService;
  const repo = {
    findCurrentUserUnscoped: () => Promise.resolve(user),
    findCurrentUserOrThrowUnscoped: () => Promise.resolve(user),
  } as unknown as FindUserRepo;

  return new UserService(authService, repo);
}

describe("UserService.getActiveUserOrThrow", () => {
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
