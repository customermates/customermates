import type { WorkspaceMembershipRow } from "../workspace-membership.repo";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { ListMyWorkspacesInteractor } from "../list-my-workspaces.interactor";

function row(companyId: string, status: Status): WorkspaceMembershipRow {
  return {
    id: `member-${companyId}`,
    companyId,
    status,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    role: status === Status.active ? { name: "Admin", isSystemRole: true } : null,
    company: {
      name: `Workspace ${companyId}`,
      slug: `workspace-${companyId}`,
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      subscription: {
        status: SubscriptionStatus.trial,
        plan: SubscriptionPlan.pro,
        trialEndDate: new Date("2026-02-01T00:00:00.000Z"),
      },
      _count: { users: 7 },
    },
  };
}

describe("ListMyWorkspacesInteractor", () => {
  const authService = { getInteractiveSession: vi.fn() };
  const workspaces = { resolveMembership: vi.fn() };
  const repo = { listWorkspaceMembershipsUnscoped: vi.fn() };

  function interactor() {
    return new ListMyWorkspacesInteractor(authService as never, workspaces as never, repo as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    authService.getInteractiveSession.mockResolvedValue({ user: { email: "ben@example.com" }, session: { id: "s" } });
    workspaces.resolveMembership.mockResolvedValue({ companyId: "active" });
  });

  it("shows the plan, trial end and member count only of workspaces the person is an active member of", async () => {
    repo.listWorkspaceMembershipsUnscoped.mockResolvedValue([
      row("active", Status.active),
      row("pending", Status.pendingAuthorization),
      row("inactive", Status.inactive),
    ]);

    const { data } = await interactor().invoke();

    expect(
      data.map(({ companyId, activeMemberCount, subscription }) => ({ companyId, activeMemberCount, subscription })),
    ).toEqual([
      {
        companyId: "active",
        activeMemberCount: 7,
        subscription: {
          status: SubscriptionStatus.trial,
          plan: SubscriptionPlan.pro,
          trialEndDate: new Date("2026-02-01T00:00:00.000Z"),
        },
      },
      { companyId: "pending", activeMemberCount: null, subscription: null },
      { companyId: "inactive", activeMemberCount: null, subscription: null },
    ]);
    expect(data.map((workspace) => workspace.name)).toEqual([
      "Workspace active",
      "Workspace pending",
      "Workspace inactive",
    ]);
  });

  it("names each workspace's URL slug and marks the one this request's URL opened as current", async () => {
    repo.listWorkspaceMembershipsUnscoped.mockResolvedValue([
      row("active", Status.active),
      row("other", Status.active),
    ]);
    const { data } = await interactor().invoke();

    expect(data.map(({ companyId, slug, isCurrent }) => ({ companyId, slug, isCurrent }))).toEqual([
      { companyId: "active", slug: "workspace-active", isCurrent: true },
      { companyId: "other", slug: "workspace-other", isCurrent: false },
    ]);
    expect(workspaces.resolveMembership).toHaveBeenCalledWith(expect.objectContaining({ session: { id: "s" } }));
  });

  it("lists nothing without an interactive session", async () => {
    authService.getInteractiveSession.mockResolvedValue(null);

    await expect(interactor().invoke()).resolves.toEqual({ ok: true, data: [] });
    expect(repo.listWorkspaceMembershipsUnscoped).not.toHaveBeenCalled();
  });
});
