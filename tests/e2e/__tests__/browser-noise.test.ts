import { describe, expect, it } from "vitest";

import { chunkLoadErrorChunk, isAppConsoleError, isBenignPageError, webkitCancelledChunk } from "../browser-noise";

const message = (type: string, text: string) => ({ type: () => type, text: () => text }) as Parameters<typeof isAppConsoleError>[0];

describe("browser engine noise filters", () => {
  it("ignores only WebKit's notice about the deliberate interactive-widget viewport key", () => {
    expect(isAppConsoleError(message("error", 'Viewport argument key "interactive-widget" not recognized and ignored.'))).toBe(false);
    expect(isAppConsoleError(message("error", 'Viewport argument key "width" not recognized and ignored.'))).toBe(true);
    expect(isAppConsoleError(message("error", "Hydration failed"))).toBe(true);
    expect(isAppConsoleError(message("warning", "Hydration failed"))).toBe(false);
  });

  it("ignores only cancelled loopback page fetches and the ResizeObserver notice", () => {
    expect(isBenignPageError("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(
      isBenignPageError("Fetch API cannot load http://127.0.0.1:4127/en/dashboard?_rsc=RxfmFIOaYlZ7eL0a due to access control checks."),
    ).toBe(true);
    expect(isBenignPageError("/127.0.0.1:4139/en/records/aa729920-5046-8399-8fea-6743d6535c22 due to access control checks.")).toBe(true);
    expect(isBenignPageError("/127.0.0.1:4139/en/settings/webhook-deliveries?searchTerm=order due to access control checks.")).toBe(true);
    expect(isBenignPageError("Fetch API cannot load http://127.0.0.1:4127/api/v1/records/query due to access control checks.")).toBe(false);
    expect(isBenignPageError("/127.0.0.1:4127/_next/static/chunks/app.js due to access control checks.")).toBe(false);
    expect(isBenignPageError("/127.0.0.1:4127/entries due to access control checks.")).toBe(false);
    expect(isBenignPageError("/127.0.0.1:4127/en/dashboard?_rsc=RxfmFIOaYlZ7eL0a due to access control checks.")).toBe(true);
    expect(isBenignPageError("Unhandled: /127.0.0.1:4127/en/dashboard?_rsc=abc due to access control checks.")).toBe(false);
    expect(isBenignPageError("/127.0.0.1:4127/en/dashboard?_rsc=abc due to access control checks. Retry")).toBe(false);
    expect(isBenignPageError("Fetch API cannot load https://example.com/en/x?_rsc=abc due to access control checks.")).toBe(false);
    expect(isBenignPageError("TypeError: Load failed")).toBe(false);
  });

  it("names only chunks whose load WebKit cancelled, and the chunk a ChunkLoadError failed on", () => {
    const request = (url: string, errorText: string | null) =>
      ({ url: () => url, failure: () => (errorText === null ? null : { errorText }) }) as Parameters<
        typeof webkitCancelledChunk
      >[0];
    expect(webkitCancelledChunk(request("http://127.0.0.1:4464/_next/static/chunks/0o5-v3u6exb5z.js", "Load request cancelled"))).toBe(
      "/_next/static/chunks/0o5-v3u6exb5z.js",
    );
    expect(webkitCancelledChunk(request("http://127.0.0.1:4464/_next/static/chunks/0o5-v3u6exb5z.js", "Could not connect to the server."))).toBeUndefined();
    expect(webkitCancelledChunk(request("http://127.0.0.1:4464/_next/static/chunks/0o5-v3u6exb5z.js", null))).toBeUndefined();
    expect(webkitCancelledChunk(request("http://127.0.0.1:4464/en/records?_rsc=abc", "Load request cancelled"))).toBeUndefined();
    expect(
      chunkLoadErrorChunk("ChunkLoadError: Failed to load chunk /_next/static/chunks/0o5-v3u6exb5z.js from module 700662"),
    ).toBe("/_next/static/chunks/0o5-v3u6exb5z.js");
    expect(chunkLoadErrorChunk("Failed to load chunk /_next/static/chunks/0o5-v3u6exb5z.js from module 700662")).toBeUndefined();
    expect(chunkLoadErrorChunk("TypeError: Load failed")).toBeUndefined();
  });
});
