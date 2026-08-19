import { describe, it, expect } from "vitest";

import { Status } from "@/generated/prisma";
import { ForbiddenError, isExpectedError, appErrorResponse } from "@/core/errors/app-errors";
import { UserService } from "../user.service";
import type { FindUserRepo } from "../user.service";
import type { AuthService } from "@/features/auth/auth.service";
import type { TenantUser } from "../user.schema";

function serviceFor(status: Status) {
  const user = { id: "user-1", email: "someone@example.com", status } as unknown as TenantUser;
  const authService = { getSession: () => Promise.resolve({ user: { email: user.email } }) } as unknown as AuthService;
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
});
