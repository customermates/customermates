import { describe, it, expect, vi, beforeEach } from "vitest";

import { ForbiddenError } from "@/core/errors/app-errors";

const mockGetActiveUserOrThrow = vi.fn();

vi.mock("@/core/di", () => ({
  getUserService: () => ({ getActiveUserOrThrow: mockGetActiveUserOrThrow }),
}));

vi.mock("@/env", () => ({ env: { APP_MODE: "self-hosted", BASE_URL: "http://localhost:4000" } }));

const { TenantInteractor } = await import("../tenant-interactor.decorator");
const { AllowInDemoMode } = await import("../allow-in-demo-mode.decorator");
const { getTenantUser } = await import("../tenant-context");

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "test@test.com",
    companyId: "company-1",
    status: "active",
    role: {
      id: "role-1",
      name: "Custom",
      isSystemRole: false,
      companyId: "company-1",
      permissions: [],
    },
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("TenantInteractor", () => {
  it("blocks user without required permission", async () => {
    const user = makeUser({ role: { ...makeUser().role, permissions: [] } });
    mockGetActiveUserOrThrow.mockResolvedValue(user);

    @TenantInteractor({ resource: "routines" as any, action: "create" as any })
    class TestInteractor {
      invoke() {
        return Promise.resolve({ ok: true as const, data: "done" });
      }
    }

    const interactor = new TestInteractor();
    await expect(interactor.invoke()).rejects.toThrow(ForbiddenError);
  });

  it("allows user with exact matching permission", async () => {
    const user = makeUser({
      role: {
        ...makeUser().role,
        permissions: [{ id: "p1", roleId: "role-1", resource: "routines", action: "create" }],
      },
    });
    mockGetActiveUserOrThrow.mockResolvedValue(user);

    @TenantInteractor({ resource: "routines" as any, action: "create" as any })
    class TestInteractor {
      invoke() {
        return Promise.resolve({ ok: true as const, data: "done" });
      }
    }

    const result = await new TestInteractor().invoke();
    expect(result).toEqual({ ok: true, data: "done" });
  });

  it("blocks user missing one permission in AND condition", async () => {
    const user = makeUser({
      role: {
        ...makeUser().role,
        permissions: [{ id: "p1", roleId: "role-1", resource: "routines", action: "readAll" }],
      },
    });
    mockGetActiveUserOrThrow.mockResolvedValue(user);

    @TenantInteractor({
      permissions: [
        { resource: "routines" as any, action: "readAll" as any },
        { resource: "routines" as any, action: "create" as any },
      ],
    })
    class TestInteractor {
      invoke() {
        return Promise.resolve({ ok: true as const, data: "done" });
      }
    }

    await expect(new TestInteractor().invoke()).rejects.toThrow(ForbiddenError);
  });

  it.each(["readAll", "readOwn"])("allows a read requirement for a role with %s", async (action) => {
    const user = makeUser({
      role: {
        ...makeUser().role,
        permissions: [{ id: "p1", roleId: "role-1", resource: "routines", action }],
      },
    });
    mockGetActiveUserOrThrow.mockResolvedValue(user);

    @TenantInteractor({ resource: "routines" as any, read: true })
    class TestInteractor {
      invoke() {
        return Promise.resolve({ ok: true as const, data: "done" });
      }
    }

    const result = await new TestInteractor().invoke();
    expect(result).toEqual({ ok: true, data: "done" });
  });

  it("blocks a read requirement when the role only manages the resource", async () => {
    const user = makeUser({
      role: {
        ...makeUser().role,
        permissions: [
          { id: "p1", roleId: "role-1", resource: "routines", action: "create" },
          { id: "p2", roleId: "role-1", resource: "users", action: "readAll" },
        ],
      },
    });
    mockGetActiveUserOrThrow.mockResolvedValue(user);

    @TenantInteractor({ resource: "routines" as any, read: true })
    class TestInteractor {
      invoke() {
        return Promise.resolve({ ok: true as const, data: "done" });
      }
    }

    await expect(new TestInteractor().invoke()).rejects.toThrow("read on routines");
  });

  it("bypasses permission check for system role", async () => {
    const user = makeUser({
      role: { ...makeUser().role, isSystemRole: true, permissions: [] },
    });
    mockGetActiveUserOrThrow.mockResolvedValue(user);

    @TenantInteractor({ resource: "routines" as any, action: "delete" as any })
    class TestInteractor {
      invoke() {
        return Promise.resolve({ ok: true as const, data: "done" });
      }
    }

    const result = await new TestInteractor().invoke();
    expect(result).toEqual({ ok: true, data: "done" });
  });

  it("allows any authenticated user when no permission requirement", async () => {
    const user = makeUser({ role: { ...makeUser().role, permissions: [] } });
    mockGetActiveUserOrThrow.mockResolvedValue(user);

    @TenantInteractor()
    class TestInteractor {
      invoke() {
        return Promise.resolve({ ok: true as const, data: "done" });
      }
    }

    const result = await new TestInteractor().invoke();
    expect(result).toEqual({ ok: true, data: "done" });
  });

  it("sets tenant context so getTenantUser returns the authenticated user", async () => {
    const user = makeUser();
    mockGetActiveUserOrThrow.mockResolvedValue(user);

    let capturedUser: unknown = null;

    @TenantInteractor()
    class TestInteractor {
      invoke() {
        capturedUser = getTenantUser();
        return Promise.resolve({ ok: true as const, data: "done" });
      }
    }

    await new TestInteractor().invoke();
    expect(capturedUser).toEqual(user);
  });

  it("includes permission names in ForbiddenError message", async () => {
    const user = makeUser({ role: { ...makeUser().role, permissions: [] } });
    mockGetActiveUserOrThrow.mockResolvedValue(user);

    @TenantInteractor({ resource: "routines" as any, action: "create" as any })
    class TestInteractor {
      invoke() {
        return Promise.resolve({ ok: true as const, data: "done" });
      }
    }

    try {
      await new TestInteractor().invoke();
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenError);
      expect((e as ForbiddenError).message).toContain("create on routines");
    }
  });
});

describe("AllowInDemoMode decorator", () => {
  it("marks class as allowed in demo mode", async () => {
    const { isAllowedInDemoMode } = await import("@/core/decorators/allow-in-demo-mode.decorator");

    @AllowInDemoMode
    class AllowedInteractor {
      invoke() {
        return { ok: true };
      }
    }

    class NotAllowedInteractor {
      invoke() {
        return { ok: true };
      }
    }

    expect(isAllowedInDemoMode(AllowedInteractor)).toBe(true);
    expect(isAllowedInDemoMode(NotAllowedInteractor)).toBe(false);
  });
});
