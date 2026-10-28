import { describe, expect, it } from "vitest";

import { chunkLoadErrorChunk, isAbortedLoadReport, isAppConsoleError, isBenignPageError, cancelledChunk } from "../browser-noise";

const message = (type: string, text: string) => ({ type: () => type, text: () => text }) as Parameters<typeof isAppConsoleError>[0];

describe("browser engine noise filters", () => {
  it("recognizes Webpack chunk reports without hiding unrelated files or external hosts", () => {
    const path = "/_next/static/chunks/6370.eb93cf4084b8f84d.js";
    expect(chunkLoadErrorChunk(`Loading chunk 6370 failed.\n(error: http://127.0.0.1:4464${path})`)).toBe(path);
    expect(chunkLoadErrorChunk(`ChunkLoadError: Loading chunk 6370 failed.\n(error: http://127.0.0.1:4464${path})`)).toBe(path);
    expect(chunkLoadErrorChunk(`Loading chunk 6370 failed.\n(error: https://external.test${path})`)).toBeUndefined();
    expect(chunkLoadErrorChunk("Error")).toBeUndefined();
    expect(chunkLoadErrorChunk("Loading chunk 6370 failed.\n(error: http://[invalid)")).toBeUndefined();
    expect(chunkLoadErrorChunk("Loading chunk 6370 failed.\n(error: http://127.0.0.1:4464/api/v1/records/query)")).toBeUndefined();
    const nested = "/_next/static/chunks/app/[locale]/(protected)/w/[workspace]/layout-aabbcc.js";
    expect(chunkLoadErrorChunk(`Loading chunk 9492 failed.\n(error: http://127.0.0.1:4464${nested})`)).toBe(nested);
    expect(cancelledChunk({
      url: () => `http://127.0.0.1:4464${nested.replaceAll("[", "%5B").replaceAll("]", "%5D")}`,
      failure: () => ({ errorText: "NS_BINDING_ABORTED" }),
    })).toBe(nested);
    expect(cancelledChunk({
      url: () => `http://127.0.0.1:4464${path}`,
      failure: () => ({ errorText: "NS_BINDING_ABORTED" }),
    })).toBe(path);
    expect(cancelledChunk({
      url: () => `http://127.0.0.1:4464${path}`,
      failure: () => ({ errorText: "net::ERR_CONNECTION_REFUSED" }),
    })).toBeUndefined();
  });

  it("matches an RSC cancellation only to its exact loopback URL and framework origin", () => {
    const base = "http://127.0.0.1:4464";
    const diagnostic = {
      kind: "console",
      text: `Failed to fetch RSC payload for ${base}/en/auth/pending?view=one. Falling back to browser navigation. TypeError: Load failed`,
      source: `${base}/_next/static/chunks/runtime.js`,
    };
    const cancelled = new Set([`${base}/en/auth/pending?view=one&_rsc=abc`]);
    expect(isAbortedLoadReport(diagnostic, cancelled)).toBe(true);
    expect(isAbortedLoadReport(diagnostic)).toBe(false);
    expect(isAbortedLoadReport(diagnostic, new Set([`${base}/en/auth/pending?view=two&_rsc=abc`]))).toBe(false);
    expect(isAbortedLoadReport({ ...diagnostic, kind: "pageerror" }, cancelled)).toBe(false);
    expect(isAbortedLoadReport({ ...diagnostic, source: `${base}/en/auth/pending` }, cancelled)).toBe(false);
    expect(isAbortedLoadReport({ ...diagnostic, source: "http://127.0.0.1:9999/_next/static/chunks/runtime.js" }, cancelled)).toBe(false);
    expect(isAbortedLoadReport({ ...diagnostic, source: "https://example.test/_next/static/chunks/runtime.js" }, cancelled)).toBe(false);
    expect(isAbortedLoadReport({ ...diagnostic, text: diagnostic.text.replaceAll(base, "https://example.test") }, new Set(["https://example.test/en/auth/pending?view=one&_rsc=abc"]))).toBe(false);
    expect(isAbortedLoadReport({ ...diagnostic, text: diagnostic.text.replace("TypeError: Load failed", "Error: HTTP 500") }, cancelled)).toBe(false);
  });

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
        typeof cancelledChunk
      >[0];
    expect(cancelledChunk(request("http://127.0.0.1:4464/_next/static/chunks/0o5-v3u6exb5z.js", "Load request cancelled"))).toBe(
      "/_next/static/chunks/0o5-v3u6exb5z.js",
    );
    expect(cancelledChunk(request("http://127.0.0.1:4464/_next/static/chunks/0o5-v3u6exb5z.js", "Could not connect to the server."))).toBeUndefined();
    expect(cancelledChunk(request("http://127.0.0.1:4464/_next/static/chunks/0o5-v3u6exb5z.js", null))).toBeUndefined();
    expect(cancelledChunk(request("http://127.0.0.1:4464/en/records?_rsc=abc", "Load request cancelled"))).toBeUndefined();
    expect(
      chunkLoadErrorChunk("ChunkLoadError: Failed to load chunk /_next/static/chunks/0o5-v3u6exb5z.js from module 700662"),
    ).toBe("/_next/static/chunks/0o5-v3u6exb5z.js");
    expect(chunkLoadErrorChunk("Failed to load chunk /_next/static/chunks/0o5-v3u6exb5z.js from module 700662")).toBeUndefined();
    expect(chunkLoadErrorChunk("TypeError: Load failed")).toBeUndefined();
  });
});
