import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
const mockEnv = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted",
  CRON_SECRET: "test-cron-secret" as string | undefined,
  VERCEL_ENV: "production" as "preview" | "production",
}));

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/core/di", () => ({ getSyncFreePlanPausesInteractor: () => ({ invoke }) }));

import { GET } from "../route";

function request(authorization?: string, query = "") {
  return new Request(`https://example.com/api/cron/free-plan${query}`, {
    headers: authorization ? { authorization } : {},
  });
}

describe("Free plan cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.APP_MODE = "cloud";
    mockEnv.VERCEL_ENV = "production";
    invoke.mockResolvedValue({ workspaces: 2, paused: 3, resumed: 1, notified: 3 });
  });

  it("refuses a caller without the cron secret", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer nope"))).status).toBe(401);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("syncs every Free workspace, or only the one named", async () => {
    const all = await GET(request("Bearer test-cron-secret"));
    expect(await all.json()).toEqual({ ok: true, workspaces: 2, paused: 3, resumed: 1, notified: 3 });
    expect(invoke).toHaveBeenLastCalledWith({ companyIds: undefined });

    await GET(request("Bearer test-cron-secret", "?companyId=co-1"));
    expect(invoke).toHaveBeenLastCalledWith({ companyIds: ["co-1"] });
  });

  it("does nothing on self-hosted installs, in the demo or on preview deployments", async () => {
    mockEnv.APP_MODE = "self-hosted";
    expect(await (await GET(request("Bearer test-cron-secret"))).json()).toEqual({ skipped: "self-hosted" });
    mockEnv.APP_MODE = "cloud";
    mockEnv.VERCEL_ENV = "preview";
    expect(await (await GET(request("Bearer test-cron-secret"))).json()).toEqual({ skipped: "preview-environment" });
    expect(invoke).not.toHaveBeenCalled();
  });
});
