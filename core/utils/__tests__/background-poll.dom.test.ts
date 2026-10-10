import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startBackgroundPoll } from "../background-poll";

let stop: () => void = () => undefined;

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function pageTransition(type: "pagehide" | "pageshow", persisted: boolean) {
  const event = new Event(type);
  Object.defineProperty(event, "persisted", { value: persisted });
  window.dispatchEvent(event);
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe("background poll", () => {
  it("refreshes on the interval and stops issuing requests once the page starts unloading", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    stop = startBackgroundPoll({ refresh, onError: vi.fn(), intervalMs: 10000, immediate: true });
    await flush();
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10000);
    expect(refresh).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event("beforeunload"));
    await vi.advanceTimersByTimeAsync(30000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("resumes when an unload is cancelled and the user interacts, or when the page is restored", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    stop = startBackgroundPoll({ refresh, onError: vi.fn(), intervalMs: 10000 });
    window.dispatchEvent(new Event("beforeunload"));
    await vi.advanceTimersByTimeAsync(10000);
    expect(refresh).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("pointerdown"));
    await flush();
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10000);
    expect(refresh).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event("keydown"));
    await flush();
    expect(refresh).toHaveBeenCalledTimes(2);
    pageTransition("pagehide", true);
    await vi.advanceTimersByTimeAsync(10000);
    expect(refresh).toHaveBeenCalledTimes(2);
    pageTransition("pageshow", false);
    await flush();
    expect(refresh).toHaveBeenCalledTimes(2);
    pageTransition("pageshow", true);
    await flush();
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("does not report a request that fails while the page unloads, but reports ordinary failures", async () => {
    const onError = vi.fn();
    let reject: (error: Error) => void = () => undefined;
    const refresh = vi.fn(() => new Promise((_resolve, fail) => (reject = fail)));
    stop = startBackgroundPoll({ refresh, onError, intervalMs: 10000, immediate: true });
    window.dispatchEvent(new Event("beforeunload"));
    reject(new TypeError("Load failed"));
    await flush();
    expect(onError).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("focus"));
    reject(new Error("unexpected"));
    await flush();
    expect(onError).toHaveBeenCalledWith(new Error("unexpected"));
  });

  it("skips overlapping and hidden-page refreshes and removes every listener when stopped", async () => {
    let resolve: () => void = () => undefined;
    const refresh = vi.fn(() => new Promise<void>((done) => (resolve = done)));
    stop = startBackgroundPoll({ refresh, onError: vi.fn(), intervalMs: 10000, immediate: true });
    await vi.advanceTimersByTimeAsync(10000);
    expect(refresh).toHaveBeenCalledTimes(1);
    resolve();
    await flush();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await vi.advanceTimersByTimeAsync(10000);
    expect(refresh).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(refresh).toHaveBeenCalledTimes(2);
    resolve();
    await flush();
    stop();
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(30000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("runs a single refresh without listeners when repetition is off", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    stop = startBackgroundPoll({ refresh, onError: vi.fn(), intervalMs: 10000, immediate: true, repeat: false });
    await vi.advanceTimersByTimeAsync(30000);
    window.dispatchEvent(new Event("focus"));
    await flush();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
