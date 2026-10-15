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
    users.listMembershipsUnscoped.mockResolvedValue([
      { companyId: "company-a", status: Status.active, lastActiveAt: null },
    ]);
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
});
