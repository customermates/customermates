import { afterEach, describe, expect, it, vi } from "vitest";

import { WORKSPACE_CHANGED_DIGEST } from "@/core/errors/workspace-changed";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("native browser reporting", () => {
  it("ignores only the known resize notices and still sends actual errors without line information", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER", "vercel");
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_BUILD_ID", "browser-fixture");
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetch);
    const reporter = await import("../browser");
    reporter.captureException("ResizeObserver loop completed with undelivered notifications.");
    reporter.captureException(new Error("ResizeObserver loop limit exceeded"));
    reporter.captureException(Object.assign(new Error("workspace changed"), { digest: WORKSPACE_CHANGED_DIGEST }));
    expect(await reporter.flush()).toBe(true);
    expect(fetch).not.toHaveBeenCalled();

    reporter.captureException(new Error("ResizeObserver callback failed"), {
      frames: [{ file: "https://app.test/script.js", line: 0, column: 0 }],
    });
    expect(await reporter.flush()).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
    const report = JSON.parse(fetch.mock.calls[0][1].body);
    expect(report.message).toBe("ResizeObserver callback failed");
    expect(report.frames).toEqual([{ file: "https://app.test/script.js", column: 0 }]);
  });
});
