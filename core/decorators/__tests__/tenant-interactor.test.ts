import { describe, it, expect, vi, beforeEach } from "vitest";

import { ForbiddenError } from "@/core/errors/app-errors";

const mockGetActiveUserOrThrow = vi.fn();

vi.mock("@/core/di", () => ({
  getUserService: () => ({ getActiveUserOrThrow: mockGetActiveUserOrThrow }),
}));

vi.mock("@/env", () => ({ env: { APP_MODE: "self-hosted", BASE_URL: "http://localhost:4000" } }));

const { TenantInteractor } = await import("../tenant-interactor.decorator");
const { AllowInDemoMode, isAllowedInDemoMode } = await import("../allow-in-demo-mode.decorator");
const { getTenantUser } = await import("../tenant-context");

type Requirement = Parameters<typeof TenantInteractor>[0];

function probe(run: () => unknown = () => "done") {
  return class {
    invoke(_input?: { id?: string }) {
      return Promise.resolve({ ok: true as const, data: run() });
    }
  };
}

function guarded(requirement: Requirement, run?: () => unknown) {
  return new (TenantInteractor<ReturnType<typeof probe>>(requirement)(probe(run)))();
}

function signIn(permissions: Array<{ resource: string; action: string }>, isSystemRole = false) {
  const user = {
    id: "user-1",
    email: "test@test.com",
    companyId: "company-1",
    status: "active",
    role: {
      id: "role-1",
      name: "Custom",
      isSystemRole,
      companyId: "company-1",
      permissions: permissions.map((permission, index) => ({ id: `p${index}`, roleId: "role-1", ...permission })),
    },
  };
  mockGetActiveUserOrThrow.mockResolvedValue(user);
  return user;
}

beforeEach(() => vi.clearAllMocks());

describe("TenantInteractor", () => {
  it("blocks a user without the required manage action and names it", async () => {
    signIn([]);

    await expect(guarded({ resource: "routines", manage: "create" }).invoke()).rejects.toThrow(ForbiddenError);
    await expect(guarded({ resource: "routines", manage: "create" }).invoke()).rejects.toThrow("create on routines");
  });

  it.each(["create", "update", "delete"] as const)("allows exactly the declared %s action", async (action) => {
    signIn([{ resource: "routines", action }]);

    await expect(guarded({ resource: "routines", manage: action }).invoke()).resolves.toEqual({
      ok: true,
      data: "done",
    });
    for (const other of (["create", "update", "delete"] as const).filter((candidate) => candidate !== action))
      await expect(guarded({ resource: "routines", manage: other }).invoke()).rejects.toThrow(`${other} on routines`);
  });

  it("requires both parts of a combined read and manage requirement", async () => {
    signIn([{ resource: "users", action: "readAll" }]);

    await expect(guarded({ resource: "users", read: "all", manage: "update" }).invoke()).rejects.toThrow(
      "update on users",
    );
  });

  it.each(["readAll", "readOwn"])("allows a read requirement for a role with %s", async (action) => {
    signIn([{ resource: "routines", action }]);

    await expect(guarded({ resource: "routines", read: true }).invoke()).resolves.toEqual({ ok: true, data: "done" });
  });

  it("blocks a read requirement when the role only manages the resource", async () => {
    signIn([
      { resource: "routines", action: "create" },
      { resource: "users", action: "readAll" },
    ]);

    await expect(guarded({ resource: "routines", read: true }).invoke()).rejects.toThrow("read on routines");
  });

  it("requires readAll for a read-all requirement", async () => {
    signIn([{ resource: "users", action: "readOwn" }]);

    await expect(guarded({ resource: "users", read: "all" }).invoke()).rejects.toThrow("readAll on users");
  });

  it.each([
    [undefined, "create", true],
    [undefined, "update", false],
    ["routine-1", "update", true],
    ["routine-1", "create", false],
  ])("requires the matching upsert action for id %s with %s", async (id, action, allowed) => {
    signIn([{ resource: "routines", action }]);

    const result = guarded({ resource: "routines", manage: "upsert" }).invoke({ id });

    if (allowed) await expect(result).resolves.toEqual({ ok: true, data: "done" });
    else await expect(result).rejects.toThrow(`${id ? "update" : "create"} on routines`);
  });

  it("bypasses permission checks for a system role", async () => {
    signIn([], true);

    await expect(guarded({ resource: "routines", manage: "delete" }).invoke()).resolves.toEqual({
      ok: true,
      data: "done",
    });
  });

  it("allows any authenticated user when no permission requirement", async () => {
    signIn([]);

    await expect(guarded(undefined).invoke()).resolves.toEqual({ ok: true, data: "done" });
  });

  it("sets tenant context so getTenantUser returns the authenticated user", async () => {
    const user = signIn([]);

    await expect(guarded(undefined, () => getTenantUser()).invoke()).resolves.toEqual({ ok: true, data: user });
  });
});

describe("AllowInDemoMode decorator", () => {
  it("marks class as allowed in demo mode", () => {
    const allowed = AllowInDemoMode(probe());

    expect(isAllowedInDemoMode(allowed)).toBe(true);
    expect(isAllowedInDemoMode(probe())).toBe(false);
  });
});
