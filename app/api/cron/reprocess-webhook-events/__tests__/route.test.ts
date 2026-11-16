import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reprocess: vi.fn(), refresh: vi.fn() }));
const mockEnv = vi.hoisted(() => ({
  CRON_SECRET: "synthetic-cron-secret",
  APP_MODE: "cloud",
  UNIPILE_API_KEY: "synthetic-key" as string | undefined,
}));

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/core/di", () => ({
  getReprocessStuckWebhookEventsInteractor: () => ({ invoke: mocks.reprocess }),
  getRefreshConnectedAccountStatusesInteractor: () => ({ invoke: mocks.refresh }),
}));

import { GET } from "../route";

const request = (authorized = true) =>
  new Request("https://example.test/api/cron/reprocess-webhook-events", {
    headers: authorized ? { authorization: "Bearer synthetic-cron-secret" } : {},
  });

describe("webhook recovery and account status cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.APP_MODE = "cloud";
    mockEnv.UNIPILE_API_KEY = "synthetic-key";
    mocks.reprocess.mockResolvedValue(undefined);
    mocks.refresh.mockResolvedValue({ refreshed: 2, failed: 0 });
  });

  it("reconciles cached statuses through the existing authenticated recovery schedule", async () => {
    const response = await GET(request());
    expect(await response.json()).toEqual({ ok: true, accountStatuses: { refreshed: 2, failed: 0 } });
    expect(mocks.reprocess).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("does not contact the provider without cron authorization", async () => {
    expect((await GET(request(false))).status).toBe(401);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("does not contact the provider in demo mode or without a configured API key", async () => {
    mockEnv.APP_MODE = "demo";
    await GET(request());
    mockEnv.APP_MODE = "cloud";
    mockEnv.UNIPILE_API_KEY = undefined;
    await GET(request());
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
