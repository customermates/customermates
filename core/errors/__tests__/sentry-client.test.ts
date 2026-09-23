import { afterEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ calls: [] as string[], init: vi.fn(), captureException: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({
  init: (...args: unknown[]) => {
    sentry.calls.push("init");
    sentry.init(...args);
  },
  captureException: (...args: unknown[]) => {
    sentry.calls.push("capture");
    sentry.captureException(...args);
  },
}));

afterEach(() => {
  sentry.calls.length = 0;
  sentry.init.mockClear();
  sentry.captureException.mockClear();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("captureError", () => {
  it("initialises the browser SDK before an explicit report, so a report sent before the idle load is not dropped", async () => {
    vi.stubGlobal("window", {});
    const { captureError } = await import("../sentry-client");
    const error = new Error("render failed");

    captureError(error);
    captureError(error);

    await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledTimes(2));
    expect(sentry.calls).toEqual(["init", "capture", "capture"]);
    expect(sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("retries the browser SDK after a failed load instead of keeping the rejected attempt", async () => {
    vi.stubGlobal("window", {});
    sentry.init.mockImplementationOnce(() => {
      throw new Error("chunk failed");
    });
    const { loadSentry } = await import("../sentry-client");

    await expect(loadSentry()).rejects.toThrow("chunk failed");
    await expect(loadSentry()).resolves.toBeDefined();
    expect(sentry.init).toHaveBeenCalledTimes(2);
  });

  it("leaves server-side initialisation to the server instrumentation", async () => {
    const { captureError } = await import("../sentry-client");
    const error = new Error("server failure");

    captureError(error);

    await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledExactlyOnceWith(error));
    expect(sentry.init).not.toHaveBeenCalled();
  });
});
