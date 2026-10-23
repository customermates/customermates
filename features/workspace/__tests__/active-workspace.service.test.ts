import type { CredentialWorkspace } from "@/features/auth/auth.service";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Status } from "@/generated/prisma";

import { createMockUser } from "@/tests/helpers/mock-user";
import { WorkspaceChangedError } from "@/core/errors/workspace-changed-error";

import { ActiveWorkspaceService } from "../active-workspace.service";

const session = { session: { id: "session-1" }, user: { id: "login-1", email: "ben@example.com" } } as never;
const memberA = createMockUser({ id: "member-a", companyId: "company-a" });
const memberB = createMockUser({ id: "member-b", companyId: "company-b" });

describe("ActiveWorkspaceService", () => {
  let binding: CredentialWorkspace;
  const authService = {
    getCredentialWorkspace: vi.fn(() => Promise.resolve(binding)),
  };
  const users = {
    findMembershipUnscoped: vi.fn(),
    findMembershipBySlugUnscoped: vi.fn(),
    listMembershipsUnscoped: vi.fn(),
    findAuthUserCompanyIdUnscoped: vi.fn(),
    setLastUsedCompanyUnscoped: vi.fn(),
  };

  function service() {
    return new ActiveWorkspaceService(authService as never, users as never);
  }

  function browsing(workspaceSlug: string | null): CredentialWorkspace {
    return { kind: "session", sessionId: "session-1", workspaceSlug };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    users.findMembershipUnscoped.mockImplementation((_email: string, companyId: string) =>
      Promise.resolve(companyId === "company-a" ? memberA : companyId === "company-b" ? memberB : null),
    );
    users.findMembershipBySlugUnscoped.mockImplementation((_email: string, slug: string) =>
      Promise.resolve(slug === "alpha" ? memberA : slug === "beta" ? memberB : null),
    );
    users.listMembershipsUnscoped.mockResolvedValue([
      { companyId: "company-a", status: Status.active },
      { companyId: "company-b", status: Status.active },
    ]);
    users.findAuthUserCompanyIdUnscoped.mockResolvedValue("company-a");
  });

  it("resolves the workspace named by the URL, whatever was used last", async () => {
    binding = browsing("beta");

    await expect(service().resolveMembership(session)).resolves.toBe(memberB);
    expect(users.findAuthUserCompanyIdUnscoped).not.toHaveBeenCalled();
  });

  it("refuses a URL workspace the login is not a member of instead of falling back", async () => {
    binding = browsing("gamma");

    await expect(service().resolveMembership(session)).rejects.toBeInstanceOf(WorkspaceChangedError);
    expect(users.listMembershipsUnscoped).not.toHaveBeenCalled();
  });

  it("opens the last used workspace for a request without a workspace in its URL", async () => {
    binding = browsing(null);

    await expect(service().resolveMembership(session)).resolves.toBe(memberA);
  });

  it("prefers an active membership when the last used workspace is gone", async () => {
    binding = browsing(null);
    users.findAuthUserCompanyIdUnscoped.mockResolvedValue("company-deleted");
    users.listMembershipsUnscoped.mockResolvedValue([
      { companyId: "company-a", status: Status.pendingAuthorization },
      { companyId: "company-b", status: Status.active },
    ]);

    await expect(service().resolveMembership(session)).resolves.toBe(memberB);
  });

  it("returns no membership for a login without workspaces", async () => {
    binding = browsing(null);
    users.listMembershipsUnscoped.mockResolvedValue([]);

    await expect(service().resolveMembership(session)).resolves.toBeNull();
  });

  it("keeps an API key or MCP token on its own workspace", async () => {
    binding = { kind: "integration", companyId: "company-b" };

    await expect(service().resolveMembership(session)).resolves.toBe(memberB);
    expect(users.findMembershipBySlugUnscoped).not.toHaveBeenCalled();
  });

  it("leaves an API key or MCP token without a workspace unauthenticated", async () => {
    binding = { kind: "integration", companyId: null };

    await expect(service().requireMembership(session)).resolves.toBeNull();
  });

  it("writes the last used workspace only when it changes", async () => {
    await service().rememberLastUsed(session, "company-a");
    expect(users.setLastUsedCompanyUnscoped).not.toHaveBeenCalled();

    await service().rememberLastUsed(session, "company-b");
    expect(users.setLastUsedCompanyUnscoped).toHaveBeenCalledWith("login-1", "company-b");
  });
});
