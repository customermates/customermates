import { describe, it, expect, vi, beforeEach } from "vitest";

import { ForbiddenError } from "@/core/errors/app-errors";

const mockGetActiveUserOrThrow = vi.fn();

vi.mock("@/core/app-di", () => ({
  getUserService: () => ({ getActiveUserOrThrow: mockGetActiveUserOrThrow }),
}));

vi.mock("@/env", () => ({ env: { DEMO_MODE: false, BASE_URL: "http://localhost:4000" } }));

const { TentantInteractor } = await import("../tenant-interactor.decorator");
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

describe("TentantInteractor", () => {
  it("blocks user without required permission", async () => {
    const user = makeUser({ role: { ...makeUser().role, permissions: [] } });
    mockGetActiveUserOrThrow.mockResolvedValue(user);

    @TentantInteractor({ resource: "contacts" as any, action: "create" as any })
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
        permissions: [{ id: "p1", roleId: "role-1", resource: "contacts", action: "create" }],
      },
    });
    mockGetActiveUserOrThrow.mockResolvedValue(user);

    @TentantInteractor({ resource: "contacts" as any, action: "create" as any })
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
        permissions: [{ id: "p1", roleId: "role-1", resource: "contacts", action: "readAll" }],
      },
    });
    mockGetActiveUserOrThrow.mockResolvedValue(user);

    @TentantInteractor({
      permissions: [
        { resource: "contacts" as any, action: "readAll" as any },
        { resource: "contacts" as any, action: "create" as any },
      ],
      condition: "AND",
    })
    class TestInteractor {
      invoke() {
        return Promise.resolve({ ok: true as const, data: "done" });
      }
    }

    await expect(new TestInteractor().invoke()).rejects.toThrow(ForbiddenError);
  });

  it("allows user with any matching permission in OR condition", async () => {
    const user = makeUser({
      role: {
        ...makeUser().role,
        permissions: [{ id: "p1", roleId: "role-1", resource: "contacts", action: "readOwn" }],
      },
    });
    mockGetActiveUserOrThrow.mockResolvedValue(user);

    @TentantInteractor({
      permissions: [
        { resource: "contacts" as any, action: "readAll" as any },
        { resource: "contacts" as any, action: "readOwn" as any },
      ],
      condition: "OR",
    })
    class TestInteractor {
      invoke() {
        return Promise.resolve({ ok: true as const, data: "done" });
      }
    }

    const result = await new TestInteractor().invoke();
    expect(result).toEqual({ ok: true, data: "done" });
  });

  it("bypasses permission check for system role", async () => {
    const user = makeUser({
      role: { ...makeUser().role, isSystemRole: true, permissions: [] },
    });
    mockGetActiveUserOrThrow.mockResolvedValue(user);

    @TentantInteractor({ resource: "contacts" as any, action: "delete" as any })
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

    @TentantInteractor()
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

    @TentantInteractor()
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

    @TentantInteractor({ resource: "contacts" as any, action: "create" as any })
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
      expect((e as ForbiddenError).message).toContain("create on contacts");
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
