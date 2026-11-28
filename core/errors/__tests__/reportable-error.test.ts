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

  it("skips a Suspense boundary the server stream never finished, which carries no digest", () => {
    const minified = new Error(
      "Minified React error #419; visit https://react.dev/errors/419 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.",
    );
    const development = new Error(
      "The server could not finish this Suspense boundary, likely due to an error during server rendering. Switched to client rendering.",
    );

    expect(isReportableError(minified)).toBe(false);
    expect(isReportableError(development)).toBe(false);
  });

  it("keeps other React production errors", () => {
    expect(isReportableError(new Error("Minified React error #418; visit https://react.dev/errors/418"))).toBe(true);
    expect(isReportableError(new Error("Minified React error #4190; visit https://react.dev/errors/4190"))).toBe(true);
  });
});
