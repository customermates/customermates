import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorActor } from "@/core/decorators/operator-context";
import type { AuthService, InteractiveSession } from "@/features/auth/auth.service";

const environment = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted",
}));

vi.mock("@/env", () => ({ env: environment }));

import { AuthError, ForbiddenError } from "@/core/errors/app-errors";
import type { OperatorAccessRepo } from "../operator-access.repo";
import { normalizeOperatorEmail, OperatorAccessService } from "../operator-access.service";

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
  const getSession = vi.fn<() => Promise<InteractiveSession | null>>();
  const isIntegrationCredentialRequest = vi.fn<() => Promise<boolean>>();
  const findAuthorizedActorUnscoped = vi.fn<OperatorAccessRepo["findAuthorizedActorUnscoped"]>();
  const findAuthorizedIntegrationActorUnscoped = vi.fn<OperatorAccessRepo["findAuthorizedIntegrationActorUnscoped"]>();
  const service = new OperatorAccessService(
    { getInteractiveSession, getSession, isIntegrationCredentialRequest } as unknown as AuthService,
    { findAuthorizedActorUnscoped, findAuthorizedIntegrationActorUnscoped },
  );

  beforeEach(() => {
    environment.APP_MODE = "cloud";
    getInteractiveSession.mockReset().mockResolvedValue(session);
    getSession.mockReset().mockResolvedValue(session);
    isIntegrationCredentialRequest.mockReset().mockResolvedValue(false);
    findAuthorizedActorUnscoped.mockReset().mockResolvedValue(actor);
    findAuthorizedIntegrationActorUnscoped.mockReset().mockResolvedValue(actor);
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

  it("never lets authorizeFresh accept integration credentials", async () => {
    isIntegrationCredentialRequest.mockResolvedValue(true);
    getInteractiveSession.mockResolvedValueOnce(null);

    await expect(service.authorizeFresh()).rejects.toBeInstanceOf(AuthError);
    expect(findAuthorizedIntegrationActorUnscoped).not.toHaveBeenCalled();
  });

  it("authorizes a read from a browser session through the interactive check", async () => {
    await expect(service.authorizeRead()).resolves.toEqual(actor);
    expect(findAuthorizedActorUnscoped).toHaveBeenCalledWith(session);
    expect(findAuthorizedIntegrationActorUnscoped).not.toHaveBeenCalled();
  });

  it("authorizes a read from an API key or OAuth token only for a verified active flagged operator", async () => {
    isIntegrationCredentialRequest.mockResolvedValue(true);

    await expect(service.authorizeRead()).resolves.toEqual(actor);
    expect(findAuthorizedIntegrationActorUnscoped).toHaveBeenCalledWith(session);

    findAuthorizedIntegrationActorUnscoped.mockResolvedValueOnce(null);
    await expect(service.authorizeRead()).rejects.toBeInstanceOf(ForbiddenError);
    findAuthorizedIntegrationActorUnscoped.mockResolvedValueOnce(null);
    await expect(service.isReadEligible()).resolves.toBe(false);
  });

  it("rejects integration reads without a resolvable credential or outside the cloud", async () => {
    isIntegrationCredentialRequest.mockResolvedValue(true);
    getSession.mockResolvedValueOnce(null);
    await expect(service.authorizeRead()).rejects.toBeInstanceOf(AuthError);

    environment.APP_MODE = "self-hosted";
    await expect(service.authorizeRead()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.isReadEligible()).resolves.toBe(false);
  });
});
