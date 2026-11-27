import type { WorkspaceSummary } from "@/features/workspace/workspace.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { ListMcpConsentWorkspacesInteractor } from "../list-mcp-consent-workspaces.interactor";

type Role = { isSystemRole: boolean; permissions: Array<{ resource: string; action: string }> };

const admin: Role = { isSystemRole: true, permissions: [] };
const viewer: Role = { isSystemRole: false, permissions: [{ resource: "wiki", action: "readAll" }] };
const apiReader: Role = { isSystemRole: false, permissions: [{ resource: "api", action: "readAll" }] };

function workspace(companyId: string, overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary {
  return {
    companyId,
    name: `Workspace ${companyId}`,
    slug: `ws-${companyId}`,
    logoUrl: null,
    status: Status.active,
    inactiveReason: null,
    roleName: "Admin",
    isAdmin: true,
    isCurrent: false,
    activeMemberCount: 1,
    subscription: { status: SubscriptionStatus.active, plan: SubscriptionPlan.starter, trialEndDate: null },
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function reason(unavailableReason: string | null) {
  return { unavailableReason, inactiveReason: null };
}

describe("ListMcpConsentWorkspacesInteractor", () => {
  const listMyWorkspaces = { invoke: vi.fn() };
  const routeGuardService = { resolveMembershipForConsent: vi.fn() };
  const authService = { getInteractiveSession: vi.fn() };
  const legal = { findAccountLegalVersionsUnscoped: vi.fn() };

  function interactor() {
    return new ListMcpConsentWorkspacesInteractor(
      authService as never,
      listMyWorkspaces as never,
      routeGuardService,
      legal,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "cloud";
    authService.getInteractiveSession.mockResolvedValue({ user: { id: "login-1" } });
    legal.findAccountLegalVersionsUnscoped.mockResolvedValue(null);
  });

  it("lists every workspace of the login with the reason it cannot be connected", async () => {
    listMyWorkspaces.invoke.mockResolvedValue({
      ok: true,
      data: [
        workspace("current", { isCurrent: true }),
        workspace("api-reader", { name: null }),
        workspace("viewer"),
        workspace("waiting", { status: Status.pendingAuthorization }),
        workspace("deactivated", { status: Status.inactive }),
        workspace("expired", {
          subscription: { status: SubscriptionStatus.expired, plan: SubscriptionPlan.starter, trialEndDate: null },
        }),
        workspace("legal"),
      ],
    });
    const roles: Record<string, Role | null> = {
      current: admin,
      "api-reader": apiReader,
      viewer,
      expired: null,
      legal: null,
    };
    routeGuardService.resolveMembershipForConsent.mockImplementation((companyId: string) =>
      Promise.resolve(roles[companyId] ? { companyId, role: roles[companyId] } : null),
    );

    const result = await interactor().invoke();

    const role = { roleName: "Admin" };
    expect(result).toEqual({
      ok: true,
      data: {
        termsOffered: true,
        termsRequired: false,
        workspaces: [
          { companyId: "current", name: "Workspace current", isCurrent: true, ...role, ...reason(null) },
          { companyId: "api-reader", name: null, isCurrent: false, ...role, ...reason(null) },
          { companyId: "viewer", name: "Workspace viewer", isCurrent: false, ...role, ...reason("permission") },
          { companyId: "waiting", name: "Workspace waiting", isCurrent: false, ...role, ...reason("pending") },
          {
            companyId: "deactivated",
            name: "Workspace deactivated",
            isCurrent: false,
            ...role,
            ...reason("inactive"),
          },
          { companyId: "expired", name: "Workspace expired", isCurrent: false, ...role, ...reason("plan") },
          { companyId: "legal", name: "Workspace legal", isCurrent: false, ...role, ...reason("terms") },
        ],
      },
    });
    expect(legal.findAccountLegalVersionsUnscoped).toHaveBeenCalledWith("login-1");
    expect(routeGuardService.resolveMembershipForConsent).not.toHaveBeenCalledWith("waiting");
    expect(routeGuardService.resolveMembershipForConsent).not.toHaveBeenCalledWith("deactivated");
  });

  it("says why an inactive membership is inactive: deactivated, paused by the plan or left without an admin", async () => {
    listMyWorkspaces.invoke.mockResolvedValue({
      ok: true,
      data: [
        workspace("deactivated", { status: Status.inactive, inactiveReason: "deactivated" }),
        workspace("paused", { status: Status.inactive, inactiveReason: "pausedByPlan" }),
        workspace("orphaned", { status: Status.inactive, inactiveReason: "noActiveAdmin" }),
      ],
    });

    const result = await interactor().invoke();

    expect(result.data.workspaces.map((item) => [item.companyId, item.unavailableReason, item.inactiveReason])).toEqual(
      [
        ["deactivated", "inactive", "deactivated"],
        ["paused", "inactive", "pausedByPlan"],
        ["orphaned", "inactive", "noActiveAdmin"],
      ],
    );
  });

  it("returns no workspaces and no terms requirement without an interactive session", async () => {
    listMyWorkspaces.invoke.mockResolvedValue({ ok: true, data: [] });
    authService.getInteractiveSession.mockResolvedValue(null);

    await expect(interactor().invoke()).resolves.toEqual({
      ok: true,
      data: { workspaces: [], termsOffered: false, termsRequired: false },
    });
    expect(routeGuardService.resolveMembershipForConsent).not.toHaveBeenCalled();
  });

  it("asks a Cloud login without any workspace to accept the terms until it accepted the current ones", async () => {
    listMyWorkspaces.invoke.mockResolvedValue({ ok: true, data: [] });

    await expect(interactor().invoke()).resolves.toEqual({
      ok: true,
      data: { workspaces: [], termsOffered: true, termsRequired: true },
    });
    expect(legal.findAccountLegalVersionsUnscoped).toHaveBeenCalledWith("login-1");

    const { currentLegalDocumentVersions } = await import("@/constants/legal-documents");
    legal.findAccountLegalVersionsUnscoped.mockResolvedValue(currentLegalDocumentVersions());
    await expect(interactor().invoke()).resolves.toMatchObject({ data: { termsOffered: false, termsRequired: false } });
  });

  it("never asks for terms outside Cloud", async () => {
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "self-hosted";
    listMyWorkspaces.invoke.mockResolvedValue({ ok: true, data: [] });

    await expect(interactor().invoke()).resolves.toMatchObject({ data: { termsOffered: false, termsRequired: false } });
  });

  it("stays available in demo mode", async () => {
    (MOCK_ENV_MODULE.env as { APP_MODE: "cloud" | "demo" | "self-hosted" }).APP_MODE = "demo";
    listMyWorkspaces.invoke.mockResolvedValue({ ok: true, data: [workspace("demo", { isCurrent: true })] });
    routeGuardService.resolveMembershipForConsent.mockResolvedValue({ companyId: "demo", role: admin });

    await expect(interactor().invoke()).resolves.toMatchObject({
      ok: true,
      data: { workspaces: [{ companyId: "demo", unavailableReason: null }] },
    });
  });
});
