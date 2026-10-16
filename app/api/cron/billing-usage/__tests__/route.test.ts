import { beforeEach, describe, expect, it, vi } from "vitest";

const reconcile = vi.hoisted(() => vi.fn());
const mockEnv = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo",
  CRON_SECRET: "test-cron-secret",
  VERCEL_ENV: "production" as "preview" | "production",
}));

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/core/di", () => ({ getReconcileBillingUsageInteractor: () => ({ invoke: reconcile }) }));

import { GET } from "../route";

function request(authorization?: string) {
  return new Request("https://customermates.com/api/cron/billing-usage", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  reconcile.mockReset().mockResolvedValue({ workspaces: 2, closed: 0, failed: 0 });
  mockEnv.APP_MODE = "cloud";
  mockEnv.VERCEL_ENV = "production";
});

describe("billing usage cron", () => {
  it("refuses a request without the cron secret", async () => {
    const response = await GET(request("Bearer wrong"));

    expect(response.status).toBe(401);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("skips preview deployments", async () => {
    mockEnv.VERCEL_ENV = "preview";

    expect(await (await GET(request("Bearer test-cron-secret"))).json()).toEqual({ skipped: "preview-environment" });
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("reconciles the billing usage ledger on its own schedule", async () => {
    const response = await GET(request("Bearer test-cron-secret"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ workspaces: 2, closed: 0, failed: 0 });
    expect(reconcile).toHaveBeenCalledOnce();
  });
});
