import type { CredentialWorkspace } from "@/features/auth/auth.service";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Status } from "@/generated/prisma";

import { createMockUser } from "@/tests/helpers/mock-user";
import { WorkspaceChangedError } from "@/core/errors/workspace-changed-error";

import { ActiveWorkspaceService } from "../active-workspace.service";

const session = { session: { id: "session-1" }, user: { id: "login-1", email: "ben@example.com" } } as never;
const memberA = createMockUser({ id: "member-a", companyId: "company-a" });

describe("ActiveWorkspaceService", () => {
  let binding: CredentialWorkspace;
  const authService = {
    getCredentialWorkspace: vi.fn(() => Promise.resolve(binding)),
    setSessionActiveCompany: vi.fn(),
  };
  const users = {
    findMembershipUnscoped: vi.fn(),
    listMembershipsUnscoped: vi.fn(),
    findAuthUserCompanyIdUnscoped: vi.fn(),
  };

  function service() {
    return new ActiveWorkspaceService(authService as never, users as never);
  }

  function stored(companyId: string | null, documentRequest: boolean): CredentialWorkspace {
    return { kind: "session", sessionId: "session-1", companyId, documentRequest };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    users.findMembershipUnscoped.mockImplementation((_email: string, companyId: string) =>
      Promise.resolve(companyId === "company-a" ? memberA : null),
    );
    users.listMembershipsUnscoped.mockResolvedValue([{ companyId: "company-a", status: Status.active }]);
    users.findAuthUserCompanyIdUnscoped.mockResolvedValue("company-a");
  });

  it("keeps the workspace stored on the session while the membership exists", async () => {
    binding = stored("company-a", false);

    await expect(service().resolveMembership(session)).resolves.toBe(memberA);
    expect(authService.setSessionActiveCompany).not.toHaveBeenCalled();
  });

  it("refuses an action, a client navigation or a fetch of a session whose workspace was left elsewhere", async () => {
    binding = stored("company-left", false);

    await expect(service().resolveMembership(session)).rejects.toBeInstanceOf(WorkspaceChangedError);
    expect(authService.setSessionActiveCompany).not.toHaveBeenCalled();
    expect(users.listMembershipsUnscoped).not.toHaveBeenCalled();
  });

  it("moves such a session to the last used workspace on a full page load", async () => {
    binding = stored("company-left", true);

    await expect(service().resolveMembership(session)).resolves.toBe(memberA);
    expect(authService.setSessionActiveCompany).toHaveBeenCalledWith("session-1", "company-a");
  });

  it("clears the workspace of a session whose only membership ended, on the next full page load", async () => {
    binding = stored("company-left", true);
    users.listMembershipsUnscoped.mockResolvedValue([]);

    await expect(service().resolveMembership(session)).resolves.toBeNull();
    expect(authService.setSessionActiveCompany).toHaveBeenCalledWith("session-1", null);

    binding = stored(null, false);
    await expect(service().resolveMembership(session)).resolves.toBeNull();
    expect(authService.setSessionActiveCompany).toHaveBeenCalledTimes(1);
  });

  it("keeps refusing the stale page's actions until that page load, so the tab reloads first", async () => {
    binding = stored("company-left", false);
    users.listMembershipsUnscoped.mockResolvedValue([]);

    await expect(service().resolveMembership(session)).rejects.toBeInstanceOf(WorkspaceChangedError);
    expect(authService.setSessionActiveCompany).not.toHaveBeenCalled();
  });

  it("opens the last used workspace for a new session whatever the request", async () => {
    binding = stored(null, false);

    await expect(service().resolveMembership(session)).resolves.toBe(memberA);
    expect(authService.setSessionActiveCompany).toHaveBeenCalledWith("session-1", "company-a");
  });

  it("never moves an API key or MCP token to another workspace", async () => {
    binding = { kind: "integration", companyId: "company-left" };

    await expect(service().resolveMembership(session)).resolves.toBeNull();
    expect(authService.setSessionActiveCompany).not.toHaveBeenCalled();
  });

  it("refuses an action or a client navigation of a session that has no workspace left, so the tab reloads", async () => {
    binding = stored(null, false);
    users.listMembershipsUnscoped.mockResolvedValue([]);

    await expect(service().requireMembership(session)).rejects.toBeInstanceOf(WorkspaceChangedError);
  });

  it("lets a full page load of a session without a workspace continue to onboarding", async () => {
    binding = stored(null, true);
    users.listMembershipsUnscoped.mockResolvedValue([]);

    await expect(service().requireMembership(session)).resolves.toBeNull();
  });

  it("leaves an API key or MCP token without a workspace unauthenticated rather than asking it to reload", async () => {
    binding = { kind: "integration", companyId: null };

    await expect(service().requireMembership(session)).resolves.toBeNull();
  });

  it("returns the membership a session still has", async () => {
    binding = stored("company-a", false);

    await expect(service().requireMembership(session)).resolves.toBe(memberA);
  });
});
