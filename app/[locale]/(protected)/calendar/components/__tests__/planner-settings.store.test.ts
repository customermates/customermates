import type { PlannerConfig } from "@/features/planner/planner.schema";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const save = vi.hoisted(() => vi.fn());
const read = vi.hoisted(() => vi.fn());
const reported = vi.hoisted(() => vi.fn());

vi.mock("../../actions", () => ({ savePlannerAction: save, readPlannerAction: read }));
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError: reported }));

import { PlannerSettingsStore } from "../planner-settings.store";

const config: PlannerConfig = { sources: [], calendarIds: [], timeZone: "UTC", mode: "month" };

beforeEach(() => {
  vi.useFakeTimers();
  save.mockReset();
  save.mockResolvedValue({ ok: true, data: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("planner settings", () => {
  it("saves the latest settings once after a pause instead of asking for a save", () => {
    const store = new PlannerSettingsStore(config);
    store.setConfig((current) => ({ ...current, mode: "week" }));
    store.setConfig((current) => ({ ...current, timeZone: "Europe/Berlin" }));
    expect(store.config).toEqual({ ...config, mode: "week", timeZone: "Europe/Berlin" });
    vi.advanceTimersByTime(999);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledExactlyOnceWith({ ...config, mode: "week", timeZone: "Europe/Berlin" });
  });

  it("writes pending settings at once when the page goes away and skips unsaved defaults", () => {
    const store = new PlannerSettingsStore(config);
    store.setConfig((current) => ({ ...current, timeZone: "Europe/Berlin" }), { persist: false });
    store.flush();
    expect(save).not.toHaveBeenCalled();
    store.setConfig((current) => ({ ...current, mode: "agenda" }));
    store.flush();
    expect(save).toHaveBeenCalledExactlyOnceWith({ ...config, timeZone: "Europe/Berlin", mode: "agenda" });
    vi.runAllTimers();
    expect(save).toHaveBeenCalledOnce();
  });

  it("keeps the answer of the newest read and marks a failed read", async () => {
    const store = new PlannerSettingsStore(config);
    const query = { config, window: { from: "2026-10-01", to: "2026-10-31" } };
    const result = (personalTruncated: boolean) => ({ sources: [], events: [], personalTruncated });
    let answerFirst: (value: unknown) => void = () => undefined;
    read.mockReset();
    read.mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)));
    read.mockResolvedValueOnce({ ok: true, data: result(true) });
    const first = store.load(query);
    await store.load(query);
    answerFirst({ ok: true, data: result(false) });
    await first;
    expect(store.data).toEqual(result(true));
    expect(store.refreshing).toBe(false);

    read.mockRejectedValueOnce(new Error("offline"));
    await store.load(query);
    expect(store.failed).toBe(true);
    expect(store.data).toEqual(result(true));
    expect(reported).toHaveBeenCalledTimes(1);
  });
});
