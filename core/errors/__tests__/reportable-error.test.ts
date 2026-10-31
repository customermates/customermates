import { describe, expect, it } from "vitest";

import { AuthError } from "../app-errors";
import { isReportableError } from "../reportable-error";
import { markWorkspaceChanged } from "../workspace-changed";

describe("isReportableError", () => {
  it("reports genuine failures", () => {
    expect(isReportableError(new Error("boom"))).toBe(true);
    expect(isReportableError("plain failure")).toBe(true);
  });

  it("skips the conditions the browser and server both handle without an application error", () => {
    const crawler = new Error("Cannot read properties of undefined (reading 'getReader')");
    crawler.stack = `${crawler.message}\n    at ev (ext:core/01_core.js:1:1)`;
    for (const error of [
      new AuthError(),
      markWorkspaceChanged(new Error("redacted")),
      new TypeError("Failed to fetch"),
      Object.assign(new Error('Server Action "40b4" was not found on the server.'), {
        name: "UnrecognizedActionError",
      }),
      Object.assign(new Error("not found"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }),
      Object.assign(new Error("redirect"), { digest: "NEXT_REDIRECT;replace;/en;307;" }),
      new Error("ResizeObserver loop completed with undelivered notifications."),
      crawler,
    ])
      expect(isReportableError(error)).toBe(false);
  });
});
