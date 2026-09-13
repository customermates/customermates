import { beforeEach, describe, expect, it, vi } from "vitest";

const invokes = vi.hoisted(() => ({ reconcile: vi.fn(), sweep: vi.fn() }));
const mockEnv = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted",
  CRON_SECRET: "test-cron-secret" as string | undefined,
  VERCEL_ENV: "production" as "preview" | "production",
}));

vi.mock("@/env", () => ({ env: mockEnv }));

vi.mock("@/core/di", () => ({
  getReconcileRoutineRunsInteractor: () => ({ invoke: invokes.reconcile }),
  getSweepDueRoutinesInteractor: () => ({ invoke: invokes.sweep }),
}));

import { GET } from "../route";

function request(authorization?: string) {
  return new Request("https://example.com/api/cron/routines", {
    headers: authorization ? { authorization } : {},
  });
}

describe("routines cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.APP_MODE = "cloud";
    mockEnv.CRON_SECRET = "test-cron-secret";
    mockEnv.VERCEL_ENV = "production";
    invokes.reconcile.mockResolvedValue({ reconciled: 2 });
    invokes.sweep.mockResolvedValue({ swept: 3 });
  });

  it("refuses a caller with no bearer token", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(invokes.reconcile).not.toHaveBeenCalled();
    expect(invokes.sweep).not.toHaveBeenCalled();
  });

  it("refuses a caller with the wrong bearer token", async () => {
    const response = await GET(request("Bearer nope"));

    expect(response.status).toBe(401);
    expect(invokes.sweep).not.toHaveBeenCalled();
  });

  it("refuses every caller when no cron secret is configured", async () => {
    mockEnv.CRON_SECRET = undefined;

    const response = await GET(request("Bearer undefined"));

    expect(response.status).toBe(401);
    expect(invokes.sweep).not.toHaveBeenCalled();
  });

  it.each([
    ["demo" as const, "production" as const, "demo-mode"],
    ["self-hosted" as const, "production" as const, "self-hosted"],
    ["cloud" as const, "preview" as const, "preview-environment"],
  ])("runs nothing in %s mode on %s", async (appMode, vercelEnv, skipped) => {
    mockEnv.APP_MODE = appMode;
    mockEnv.VERCEL_ENV = vercelEnv;

    const response = await GET(request("Bearer test-cron-secret"));

    await expect(response.json()).resolves.toEqual({ skipped });
    expect(invokes.reconcile).not.toHaveBeenCalled();
    expect(invokes.sweep).not.toHaveBeenCalled();
  });

  it("reconciles orphaned runs before sweeping for due ones", async () => {
    const response = await GET(request("Bearer test-cron-secret"));

    await expect(response.json()).resolves.toEqual({ ok: true, reconciled: 2, swept: 3 });
    expect(invokes.reconcile.mock.invocationCallOrder[0]).toBeLessThan(invokes.sweep.mock.invocationCallOrder[0]);
  });
});
