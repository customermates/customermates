import type { WorkspaceMembershipRow } from "@/features/workspace/workspace-membership.repo";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { McpWorkspaceAccessService } from "../mcp-workspace-access.service";

const EMAIL = "member@example.com";
const admin = { isSystemRole: true, permissions: [] };
const noApi = { isSystemRole: false, permissions: [{ resource: "wiki", action: "readAll" }] };

function row(companyId: string, name: string | null, overrides: Partial<WorkspaceMembershipRow> = {}) {
  return {
    id: `member-${companyId}`,
    companyId,
    status: Status.active,
    pausedByPlanAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    role: { name: "Admin", isSystemRole: true },
    company: {
      name,
      slug: `slug-${companyId}`,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      hasActiveAdmin: true,
      subscription: { status: SubscriptionStatus.trial, plan: SubscriptionPlan.pro, trialEndDate: null },
      _count: { users: 1 },
    },
    ...overrides,
  } satisfies WorkspaceMembershipRow;
}

describe("McpWorkspaceAccessService", () => {
  const memberships = { listWorkspaceMembershipsUnscoped: vi.fn() };
  const routeGuard = { resolveMcpMembership: vi.fn() };
  const slugs = { slugFor: vi.fn() };
  const service = new McpWorkspaceAccessService(memberships, routeGuard, slugs);

  beforeEach(() => {
    vi.clearAllMocks();
    routeGuard.resolveMcpMembership.mockImplementation((_email: string, companyId: string) =>
      Promise.resolve({ companyId, role: companyId === "viewer" ? noApi : admin }),
    );
  });

  it("uses the only usable workspace when a call names none", async () => {
    memberships.listWorkspaceMembershipsUnscoped.mockResolvedValue([
      row("crm", "CRM"),
      row("waiting", "Waiting", { status: Status.pendingAuthorization }),
    ]);

    await expect(service.resolve(EMAIL, null)).resolves.toEqual({
      ok: true,
      workspace: { companyId: "crm", slug: "slug-crm" },
    });
    expect(memberships.listWorkspaceMembershipsUnscoped).toHaveBeenCalledWith(EMAIL);
  });

  it("refuses a call without workspace when several are usable and lists them by name and slug", async () => {
    memberships.listWorkspaceMembershipsUnscoped.mockResolvedValue([row("crm", "CRM"), row("taxes", null)]);

    const resolution = await service.resolve(EMAIL, null);

    expect(resolution.ok).toBe(false);
    if (!resolution.ok) {
      expect(resolution.message).toContain("several workspaces");
      expect(resolution.message).toContain("CRM (slug-crm), Unnamed workspace (slug-taxes)");
    }
  });

  it.each([
    ["slug", "slug-taxes"],
    ["id", "taxes"],
  ])("resolves a named workspace by its %s", async (_label, requested) => {
    memberships.listWorkspaceMembershipsUnscoped.mockResolvedValue([row("crm", "CRM"), row("taxes", "Taxes")]);

    await expect(service.resolve(EMAIL, requested)).resolves.toEqual({
      ok: true,
      workspace: { companyId: "taxes", slug: "slug-taxes" },
    });
  });

  it("refuses a workspace the login is not a member of", async () => {
    memberships.listWorkspaceMembershipsUnscoped.mockResolvedValue([row("crm", "CRM")]);

    const resolution = await service.resolve(EMAIL, "slug-foreign");

    expect(resolution).toEqual({
      ok: false,
      message: 'This account has no workspace "slug-foreign". Pass workspace with one of: CRM (slug-crm).',
    });
  });

  it.each([
    ["pending", row("waiting", "Waiting", { status: Status.pendingAuthorization }), "still waiting for approval"],
    ["inactive", row("off", "Off", { status: Status.inactive }), "deactivated"],
    ["without API access", row("viewer", "Viewer"), "Read access All on API & Webhooks"],
  ])("refuses a named workspace that is %s and says why", async (_label, membership, reason) => {
    memberships.listWorkspaceMembershipsUnscoped.mockResolvedValue([row("crm", "CRM"), membership]);

    const resolution = await service.resolve(EMAIL, membership.company.slug);

    expect(resolution.ok).toBe(false);
    if (!resolution.ok) expect(resolution.message).toContain(reason);
  });

  it("refuses a workspace whose plan or terms block it", async () => {
    routeGuard.resolveMcpMembership.mockResolvedValue(null);
    memberships.listWorkspaceMembershipsUnscoped.mockResolvedValue([
      row("locked", "Locked", {
        company: {
          ...row("locked", "Locked").company,
          subscription: { status: SubscriptionStatus.unPaid, plan: SubscriptionPlan.pro, trialEndDate: null },
        },
      }),
      row("terms", "Terms"),
    ]);

    const options = await service.listWorkspaces(EMAIL);

    expect(options.map((option) => option.unavailableReason)).toEqual(["plan", "terms"]);
  });

  it("points a login without any usable workspace to listing and creating one", async () => {
    memberships.listWorkspaceMembershipsUnscoped.mockResolvedValue([]);

    const resolution = await service.resolve(EMAIL, null);

    expect(resolution.ok).toBe(false);
    if (!resolution.ok) expect(resolution.message).toContain("create_workspace");
  });

  it("prefers the token's default workspace for discovery and otherwise only an unambiguous one", async () => {
    memberships.listWorkspaceMembershipsUnscoped.mockResolvedValue([row("crm", "CRM"), row("taxes", "Taxes")]);

    await expect(service.defaultWorkspace(EMAIL, "taxes")).resolves.toEqual({ companyId: "taxes", slug: "slug-taxes" });
    await expect(service.defaultWorkspace(EMAIL, null)).resolves.toBeNull();
    await expect(service.defaultWorkspace(EMAIL, "removed")).resolves.toBeNull();
  });

  it("matches a workspace argument against the id or slug of a fixed workspace", async () => {
    slugs.slugFor.mockResolvedValue("slug-crm");

    await expect(service.isWorkspace("crm", "crm")).resolves.toBe(true);
    await expect(service.isWorkspace("crm", "slug-crm")).resolves.toBe(true);
    await expect(service.isWorkspace("crm", "slug-taxes")).resolves.toBe(false);
  });
});
