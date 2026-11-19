import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
const sweepFiles = vi.hoisted(() => vi.fn());
const sweepRules = vi.hoisted(() => vi.fn());
const sweepAgentJobs = vi.hoisted(() => vi.fn());
const notifyRunnerOffline = vi.hoisted(() => vi.fn());
const sendInstantFallback = vi.hoisted(() => vi.fn());
const sendBookingReminders = vi.hoisted(() => vi.fn());
const mockEnv = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted",
  CRON_SECRET: "test-cron-secret" as string | undefined,
  VERCEL_ENV: "production" as "production" | "preview",
}));
vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/core/di", () => ({
  getSweepRecordDeliveriesInteractor: () => ({ invoke }),
  getSweepRecordFileIndexInteractor: () => ({ invoke: sweepFiles }),
  getSweepAutomationRulesInteractor: () => ({ invoke: sweepRules }),
  getSweepAgentJobTimeoutsInteractor: () => ({ invoke: sweepAgentJobs }),
  getNotifyRunnerOfflineInteractor: () => ({ invoke: notifyRunnerOffline }),
  getSendInstantNotificationFallbackInteractor: () => ({ invoke: sendInstantFallback }),
  getSendBookingRemindersInteractor: () => ({ invoke: sendBookingReminders }),
}));

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
    sweepFiles.mockResolvedValue({ fileIndexWorkspaces: 1 });
    sweepRules.mockResolvedValue({ automationRulesAdmitted: 4, automationRunsRedispatched: 1 });
    sweepAgentJobs.mockResolvedValue({ agentJobsTimedOut: 1, agentJobsRequeued: 2, agentJobsRedispatched: 3 });
    notifyRunnerOffline.mockResolvedValue({ runnerOfflineNotified: 2 });
    sendInstantFallback.mockResolvedValue({ instantNotificationFallbacks: 5 });
    sendBookingReminders.mockResolvedValue({ bookingReminders: 6 });
  });

  it("requires the configured cron secret", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer wrong"))).status).toBe(401);
    mockEnv.CRON_SECRET = undefined;
    expect((await GET(request("Bearer undefined"))).status).toBe(401);
    expect(invoke).not.toHaveBeenCalled();
    expect(sweepFiles).not.toHaveBeenCalled();
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
      fileIndexWorkspaces: 1,
      automationRulesAdmitted: 4,
      automationRunsRedispatched: 1,
      agentJobsTimedOut: 1,
      agentJobsRequeued: 2,
      agentJobsRedispatched: 3,
      runnerOfflineNotified: 2,
      instantNotificationFallbacks: 5,
      bookingReminders: 6,
    });
    expect(sendBookingReminders).toHaveBeenCalledTimes(1);
    expect(sendInstantFallback).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(sweepFiles).toHaveBeenCalledTimes(1);
    expect(sweepRules).toHaveBeenCalledTimes(1);
    expect(sweepAgentJobs).toHaveBeenCalledTimes(1);
    expect(notifyRunnerOffline).toHaveBeenCalledTimes(1);
  });

  it("recovers agent jobs every five minutes, before it reports runners that are offline", async () => {
    mockEnv.APP_MODE = "self-hosted";
    await expect((await GET(request("Bearer test-cron-secret"))).json()).resolves.toMatchObject({
      ok: true,
      agentJobsRequeued: 2,
    });
    expect(sweepAgentJobs.mock.invocationCallOrder[0]).toBeLessThan(notifyRunnerOffline.mock.invocationCallOrder[0]);
  });

  it("still recovers agent jobs when another sweep fails, and reports the failed one", async () => {
    sweepRules.mockRejectedValue(new Error("date sweep timed out"));

    await expect(GET(request("Bearer test-cron-secret"))).rejects.toThrow(
      "Sweeps failed: automationRules (date sweep timed out)",
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(sweepFiles).toHaveBeenCalledTimes(1);
    expect(sweepAgentJobs).toHaveBeenCalledTimes(1);
    expect(notifyRunnerOffline).toHaveBeenCalledTimes(1);
  });

  it("sweeps date-reached rules on self-hosted instances too", async () => {
    mockEnv.APP_MODE = "self-hosted";
    await expect((await GET(request("Bearer test-cron-secret"))).json()).resolves.toMatchObject({
      ok: true,
      automationRulesAdmitted: 4,
    });
    expect(sweepRules).toHaveBeenCalledTimes(1);
  });

  it("restarts stalled file indexing on self-hosted instances too", async () => {
    mockEnv.APP_MODE = "self-hosted";
    await expect((await GET(request("Bearer test-cron-secret"))).json()).resolves.toMatchObject({
      ok: true,
      fileIndexWorkspaces: 1,
    });
    expect(sweepFiles).toHaveBeenCalledTimes(1);
  });

  it("sends booking reminders only where booking pages exist, in the cloud", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const body = await (await GET(request("Bearer test-cron-secret"))).json();

    expect(body).not.toHaveProperty("bookingReminders");
    expect(sendBookingReminders).not.toHaveBeenCalled();
  });

  it("still runs the other sweeps when the booking reminders fail", async () => {
    sendBookingReminders.mockRejectedValue(new Error("mail down"));

    await expect(GET(request("Bearer test-cron-secret"))).rejects.toThrow(
      "Sweeps failed: bookingReminders (mail down)",
    );
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(sendInstantFallback).toHaveBeenCalledTimes(1);
  });
});
