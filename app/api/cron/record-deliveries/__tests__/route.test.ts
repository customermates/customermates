import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
const mockEnv = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo",
  CRON_SECRET: "test-cron-secret" as string | undefined,
  VERCEL_ENV: "production" as "production" | "preview",
}));
vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/core/di", () => ({ getSweepRecordDeliveriesInteractor: () => ({ invoke }) }));

import { GET } from "../route";

function request(authorization?: string) {
  return new Request("http://127.0.0.1/api/cron/record-deliveries", {
    headers: authorization ? { authorization } : {},
  });
}

describe("record delivery recovery cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.APP_MODE = "cloud";
    mockEnv.CRON_SECRET = "test-cron-secret";
    mockEnv.VERCEL_ENV = "production";
    invoke.mockResolvedValue({ eventWorkspaces: 2, webhookDeliveries: 3 });
  });

  it("requires the configured cron secret", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer wrong"))).status).toBe(401);
    mockEnv.CRON_SECRET = undefined;
    expect((await GET(request("Bearer undefined"))).status).toBe(401);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("skips demo and preview environments", async () => {
    mockEnv.APP_MODE = "demo";
    await expect((await GET(request("Bearer test-cron-secret"))).json()).resolves.toEqual({ skipped: "demo-mode" });
    mockEnv.APP_MODE = "cloud";
    mockEnv.VERCEL_ENV = "preview";
    await expect((await GET(request("Bearer test-cron-secret"))).json()).resolves.toEqual({
      skipped: "preview-environment",
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("dispatches due work only after authorization", async () => {
    await expect((await GET(request("Bearer test-cron-secret"))).json()).resolves.toEqual({
      ok: true,
      eventWorkspaces: 2,
      webhookDeliveries: 3,
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
