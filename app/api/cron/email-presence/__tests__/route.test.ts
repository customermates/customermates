import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ dispatch: vi.fn() }));
const mockEnv = vi.hoisted(() => ({
  CRON_SECRET: "synthetic-cron-secret",
  APP_MODE: "cloud",
  UNIPILE_API_KEY: "synthetic-key" as string | undefined,
}));

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/core/di", () => ({
  getDispatchEmailPresenceSweepsInteractor: () => ({ invoke: mocks.dispatch }),
}));

import { GET } from "../route";

const request = (authorized = true) =>
  new Request("https://example.test/api/cron/email-presence", {
    headers: authorized ? { authorization: "Bearer synthetic-cron-secret" } : {},
  });

describe("daily email presence sweep cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.APP_MODE = "cloud";
    mockEnv.UNIPILE_API_KEY = "synthetic-key";
    mocks.dispatch.mockResolvedValue({ dispatched: 2, failed: 0 });
  });

  it("starts one sweep per IMAP account", async () => {
    const response = await GET(request());

    expect(await response.json()).toEqual({ ok: true, sweeps: { dispatched: 2, failed: 0 } });
    expect(mocks.dispatch).toHaveBeenCalledOnce();
  });

  it("starts nothing without cron authorization", async () => {
    expect((await GET(request(false))).status).toBe(401);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("starts nothing in demo mode or without a configured API key", async () => {
    mockEnv.APP_MODE = "demo";
    await GET(request());
    mockEnv.APP_MODE = "cloud";
    mockEnv.UNIPILE_API_KEY = undefined;
    await GET(request());

    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
