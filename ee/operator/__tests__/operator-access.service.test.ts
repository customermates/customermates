import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorActor } from "@/core/decorators/operator-context";
import type { AuthService, InteractiveSession } from "@/features/auth/auth.service";

const environment = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted",
}));

vi.mock("@/env", () => ({ env: environment }));

import { AuthError, ForbiddenError } from "@/core/errors/app-errors";
import { normalizeOperatorEmail, OperatorAccessService, type OperatorAccessRepo } from "../operator-access.service";

const session = {
  session: { id: "session-id" },
  user: { id: "auth-id", email: "operator@example.invalid" },
} as InteractiveSession | null;
const actor: OperatorActor = {
  authUserId: "auth-id",
  userId: "user-id",
  companyId: "company-id",
  email: "operator@example.invalid",
};

describe("OperatorAccessService", () => {
  const getInteractiveSession = vi.fn<() => Promise<InteractiveSession | null>>();
  const findAuthorizedActorUnscoped = vi.fn<OperatorAccessRepo["findAuthorizedActorUnscoped"]>();
  const service = new OperatorAccessService({ getInteractiveSession } as unknown as AuthService, {
    findAuthorizedActorUnscoped,
  });

  beforeEach(() => {
    environment.APP_MODE = "cloud";
    getInteractiveSession.mockReset().mockResolvedValue(session);
    findAuthorizedActorUnscoped.mockReset().mockResolvedValue(actor);
  });

  it("normalizes candidate identifiers without making them authorization", () => {
    expect(normalizeOperatorEmail("  Linnea@Example.COM ")).toBe("linnea@example.com");
  });

  it("returns the persisted operator actor after a fresh interactive check", async () => {
    await expect(service.authorizeFresh()).resolves.toEqual(actor);
    expect(findAuthorizedActorUnscoped).toHaveBeenCalledWith(session);
  });

  it.each(["self-hosted", "demo"] as const)("denies application mode %s", async (mode) => {
    environment.APP_MODE = mode;
    await expect(service.authorizeFresh()).rejects.toBeInstanceOf(ForbiddenError);
    expect(getInteractiveSession).not.toHaveBeenCalled();
  });

  it("rejects requests without the interactive cookie session", async () => {
    getInteractiveSession.mockResolvedValueOnce(null);

    await expect(service.authorizeFresh()).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects a session that no longer maps to a verified active flagged operator", async () => {
    findAuthorizedActorUnscoped.mockResolvedValueOnce(null);

    await expect(service.authorizeFresh()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("uses a fail-closed boolean for shell visibility", async () => {
    findAuthorizedActorUnscoped.mockResolvedValueOnce(null);

    await expect(service.isEligible()).resolves.toBe(false);
  });

  it("does not conceal an authorization storage outage", async () => {
    findAuthorizedActorUnscoped.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(service.isEligible()).rejects.toThrow("database unavailable");
  });
});
