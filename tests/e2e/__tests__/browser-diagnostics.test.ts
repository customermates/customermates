import type { BrowserContext, Page, TestInfo } from "@playwright/test";

import { describe, expect, it, vi } from "vitest";

import { BrowserDiagnostics, isSandboxedResourceFailure } from "../browser-diagnostics";

type Handler = (value: unknown) => void;

function fakeEmitter() {
  const handlers = new Map<string, Handler[]>();
  return {
    on: (event: string, handler: Handler) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
    emit: (event: string, value?: unknown) => (handlers.get(event) ?? []).forEach((handler) => handler(value)),
  };
}

function fakeBrowser() {
  const contextEvents = fakeEmitter();
  const pageEvents = fakeEmitter();
  const state = { closed: false, detached: false };
  const mainFrame = { page: () => page, isDetached: () => state.detached };
  const page = {
    on: pageEvents.on,
    context: () => context,
    mainFrame: () => mainFrame,
    isClosed: () => state.closed,
  } as unknown as Page;
  const context = { on: contextEvents.on, pages: () => [page] } as unknown as BrowserContext;
  const request = (url: string, isDocument = false) => ({
    url: () => url,
    isNavigationRequest: () => isDocument,
    redirectedFrom: () => null,
    frame: () => mainFrame,
    failure: () => ({ errorText: "net::ERR_ABORTED" }),
    resourceType: () => (isDocument ? "document" : "fetch"),
  });
  const respond = (sent: ReturnType<typeof request>, status: number, statusText = "") =>
    contextEvents.emit("response", {
      url: sent.url,
      status: () => status,
      statusText: () => statusText,
      frame: () => mainFrame,
      request: () => sent,
    });
  return {
    state,
    context,
    page,
    console: (text: string, source = "") =>
      contextEvents.emit("console", {
        type: () => "error",
        text: () => text,
        location: () => ({ url: source }),
        page: () => page,
      }),
    pageError: (message: string) =>
      contextEvents.emit("weberror", { error: () => new Error(message), page: () => page }),
    cancelledChunk: (url: string) =>
      contextEvents.emit("requestfailed", {
        url: () => url,
        failure: () => ({ errorText: "Load request cancelled" }),
        resourceType: () => "script",
        frame: () => ({ page: () => page }),
      }),
    abortedLoad: (
      url: string,
      errorText = "Load request cancelled",
      resourceType = "fetch",
      { method = "GET", rsc = false }: { method?: string; rsc?: boolean } = {},
    ) => {
      const sent = {
        ...request(url),
        failure: () => ({ errorText }),
        resourceType: () => resourceType,
        method: () => method,
        headers: () => (rsc ? { rsc: "1" } : {}),
      };
      contextEvents.emit("request", sent);
      contextEvents.emit("requestfailed", sent);
    },
    navigation: (url: string) =>
      contextEvents.emit("request", {
        url: () => url,
        isNavigationRequest: () => true,
        redirectedFrom: () => null,
        frame: () => mainFrame,
      }),
    requested: (url: string) =>
      contextEvents.emit("request", { url: () => url, isNavigationRequest: () => false, frame: () => mainFrame }),
    loaded: () => pageEvents.emit("domcontentloaded"),
    response: (url: string, status: number, statusText = "", isDocument = false) => {
      const sent = request(url, isDocument);
      respond(sent, status, statusText);
      contextEvents.emit("requestfinished", sent);
    },
    /** A request the page sends, answered with `respond` and completed with `finish` or `fail`. */
    send: (url: string, isDocument = false) => {
      const sent = request(url, isDocument);
      contextEvents.emit("request", sent);
      return sent;
    },
    respond,
    finish: (sent: ReturnType<typeof request>) => contextEvents.emit("requestfinished", sent),
    fail: (sent: ReturnType<typeof request>) => contextEvents.emit("requestfailed", sent),
  };
}

function fakeTestInfo(status: TestInfo["status"], expectedStatus: TestInfo["expectedStatus"] = "passed") {
  return { status, expectedStatus, attach: vi.fn(async () => undefined) } as unknown as TestInfo & {
    attach: ReturnType<typeof vi.fn>;
  };
}

const NOT_FOUND = "Failed to load resource: the server responded with a status of 404 (Not Found)";
const BASE = "http://127.0.0.1:4464";

describe("browser diagnostics", () => {
  it("reports each load of the app answered with an HTTP error once, from the response, on every browser", () => {
    const browser = fakeBrowser();
    const diagnostics = new BrowserDiagnostics().watch(browser.context);
    browser.response(`${BASE}/api/v1/records/query`, 500, "Internal Server Error");
    // Chromium and WebKit log their own copy; Firefox logs nothing. Either way the response above is the one report.
    browser.console(
      "Failed to load resource: the server responded with a status of 500 (Internal Server Error)",
      `${BASE}/api/v1/records/query`,
    );
    browser.response(`${BASE}/api/v1/records/mutate`, 422);
    browser.response(`${BASE}/en/dashboard`, 200, "OK");
    browser.response(`${BASE}/en/settings`, 308, "Permanent Redirect");
    browser.response("https://flagcdn.com/w40/de.png", 404, "Not Found");
    browser.console("Failed to load resource: net::ERR_FAILED", `${BASE}/api/v1/records/query`);
    expect(diagnostics.unexpected.map(({ text, source, document }) => [text, source, document])).toEqual([
      [
        "Failed to load resource: the server responded with a status of 500 (Internal Server Error)",
        `${BASE}/api/v1/records/query`,
        false,
      ],
      ["Failed to load resource: the server responded with a status of 422", `${BASE}/api/v1/records/mutate`, false],
      ["Failed to load resource: net::ERR_FAILED", `${BASE}/api/v1/records/query`, undefined],
    ]);
  });

  it("ignores an HTTP error of a request aborted or of a page that navigated away, closed or lost its frame", () => {
    const browser = fakeBrowser();
    const diagnostics = new BrowserDiagnostics().watch(browser.context);
    const aborted = browser.send(`${BASE}/api/v1/records/aborted`);
    browser.respond(aborted, 500);
    expect(diagnostics.unexpected).toEqual([]);
    browser.fail(aborted);
    browser.finish(aborted);

    const stale = browser.send(`${BASE}/api/v1/records/stale`);
    const document = browser.send(`${BASE}/en/records/unknown`, true);
    browser.respond(stale, 500);
    browser.respond(document, 404, "Not Found");
    browser.finish(stale);
    browser.finish(document);

    const current = browser.send(`${BASE}/api/v1/records/current`);
    browser.respond(current, 500);
    browser.finish(current);
    // Chromium can report a request as finished or failed before its response.
    const early = browser.send(`${BASE}/api/v1/records/early`);
    browser.finish(early);
    browser.respond(early, 500);
    const earlyAborted = browser.send(`${BASE}/api/v1/records/early-aborted`);
    browser.fail(earlyAborted);
    browser.respond(earlyAborted, 500);

    browser.state.detached = true;
    browser.response(`${BASE}/api/v1/records/detached`, 500);
    browser.state.detached = false;
    browser.state.closed = true;
    browser.response(`${BASE}/api/v1/records/closed`, 500);
    expect(diagnostics.unexpected.map(({ source }) => source)).toEqual([
      `${BASE}/en/records/unknown`,
      `${BASE}/api/v1/records/current`,
      `${BASE}/api/v1/records/early`,
    ]);
  });

  it("counts an HTTP error once the browser logs it, the request finishes or a grace period passes", () => {
    vi.useFakeTimers();
    try {
      const browser = fakeBrowser();
      const diagnostics = new BrowserDiagnostics().watch(browser.context);
      // Chromium logs a missing script as the response arrives and then reports the request as failed.
      const script = browser.send(`${BASE}/_next/static/chunks/missing.js`);
      browser.respond(script, 404, "Not Found");
      browser.console(NOT_FOUND, `${BASE}/_next/static/chunks/missing.js`);
      browser.fail(script);
      // A fetch whose body the page never reads may neither finish nor fail.
      const unread = browser.send(`${BASE}/api/v1/records/unread`);
      browser.respond(unread, 500);
      expect(diagnostics.unexpected.map(({ source }) => source)).toEqual([`${BASE}/_next/static/chunks/missing.js`]);
      vi.advanceTimersByTime(2000);
      browser.finish(unread);
      expect(diagnostics.unexpected.map(({ source }) => source)).toEqual([
        `${BASE}/_next/static/chunks/missing.js`,
        `${BASE}/api/v1/records/unread`,
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a console copy only for a failure without a response, each failure once in either order", async () => {
    const browser = fakeBrowser();
    const diagnostics = new BrowserDiagnostics().watch(browser.context);
    const view = diagnostics.view(browser.page);
    const report = (status: string) => `Failed to load resource: the server responded with a status of ${status}`;
    browser.console(report("503 (Service Unavailable)"), `${BASE}/api/v1/records/no-response`);
    browser.response(`${BASE}/api/v1/records/after`, 500);
    browser.console(report("500 (Internal Server Error)"), `${BASE}/api/v1/records/after`);
    browser.console(report("404 (Not Found)"), `${BASE}/en/records/before`);
    expect(view).toHaveLength(3);
    browser.response(`${BASE}/en/records/before`, 404, "Not Found", true);
    browser.console(report("500 (Internal Server Error)"), `${BASE}/api/v1/records/after`);
    const pending = browser.send(`${BASE}/api/v1/records/pending`);
    browser.respond(pending, 502);
    await expect(diagnostics.verify(fakeTestInfo("failed"))).resolves.toBeUndefined();
    expect(diagnostics.unexpected.map(({ text, source, document }) => [text, source, document])).toEqual([
      [report("503 (Service Unavailable)"), `${BASE}/api/v1/records/no-response`, undefined],
      [report("500"), `${BASE}/api/v1/records/after`, false],
      [report("404 (Not Found)"), `${BASE}/en/records/before`, true],
      [report("500 (Internal Server Error)"), `${BASE}/api/v1/records/after`, undefined],
      [report("502"), `${BASE}/api/v1/records/pending`, false],
    ]);
    expect(view).toEqual(diagnostics.unexpected.map(({ text }) => text));
  });

  it("drops only failed loads of other origins, which the sign-in sandbox blocks", () => {
    const failed = (source: string, text = "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT") =>
      isSandboxedResourceFailure({ kind: "console", text, source });
    expect(failed("https://flagcdn.com/w40/de.png")).toBe(true);
    expect(failed("https://customermates.com/demo/avatars/photos/a.png")).toBe(true);
    expect(failed(`${BASE}/api/v1/records/query`, NOT_FOUND)).toBe(false);
    expect(failed(`${BASE}/_next/static/chunks/app.js`)).toBe(false);
    expect(failed("http://localhost:4464/en/dashboard")).toBe(false);
    expect(failed("")).toBe(false);
    expect(failed("https://flagcdn.com/w40/de.png", "Uncaught TypeError: boom")).toBe(false);
    expect(
      isSandboxedResourceFailure({ kind: "pageerror", text: "Failed to load resource", source: "https://a.test/" }),
    ).toBe(false);
  });

  it("keeps unrelated API and chunk failures visible next to an expected 404 document", () => {
    const browser = fakeBrowser();
    const diagnostics = new BrowserDiagnostics().watch(browser.context);
    const view = diagnostics.view(browser.page);
    const notFound = diagnostics.expect({
      kind: "console",
      text: /status of 404/,
      source: (url) => url.pathname === "/en/records/unknown",
      page: browser.page,
    });
    const documents = diagnostics.expect({ kind: "console", text: /status of 404/, document: true, page: browser.page });
    browser.response(`${BASE}/en/records/unknown`, 404, "Not Found", true);
    browser.response(`${BASE}/api/v1/records/query`, 404, "Not Found");
    browser.response(`${BASE}/en/records/unknown`, 404, "Not Found", true);
    browser.response(`${BASE}/en/records/elsewhere`, 404, "Not Found", true);
    browser.pageError("ChunkLoadError: Failed to load chunk /_next/static/chunks/app.js from module 7");
    browser.console("Failed to load resource: net::ERR_BLOCKED_BY_CLIENT", "https://flagcdn.com/w40/de.png");
    browser.pageError("ResizeObserver loop completed with undelivered notifications.");

    expect(notFound.events.map(({ source }) => source)).toEqual([`${BASE}/en/records/unknown`]);
    expect(documents.events.map(({ source }) => source)).toEqual([`${BASE}/en/records/unknown`]);
    expect(diagnostics.unexpected.map(({ kind, source }) => [kind, source])).toEqual([
      ["console", `${BASE}/api/v1/records/query`],
      ["console", `${BASE}/en/records/elsewhere`],
      ["pageerror", ""],
    ]);
    expect(view).toEqual([
      NOT_FOUND,
      NOT_FOUND,
      "ChunkLoadError: Failed to load chunk /_next/static/chunks/app.js from module 7",
    ]);
  });

  it("does not let an expectation for one page or kind absorb another", () => {
    const browser = fakeBrowser();
    const other = fakeBrowser();
    const diagnostics = new BrowserDiagnostics().watch(browser.context).watch(other.context);
    diagnostics.expect({ kind: "console", text: /status of 422/, page: browser.page, limit: Number.POSITIVE_INFINITY });
    other.response(`${BASE}/api/agent/messages`, 422);
    browser.pageError("Failed to load resource: the server responded with a status of 422 ()");
    expect(diagnostics.unexpected.map(({ kind }) => kind)).toEqual(["console", "pageerror"]);
  });

  it("forgets a chunk error only when WebKit cancelled that chunk and the next page loaded", () => {
    const browser = fakeBrowser();
    const diagnostics = new BrowserDiagnostics().watch(browser.context);
    const cancelled = "ChunkLoadError: Failed to load chunk /_next/static/chunks/a1.js from module 1";
    const missing = "ChunkLoadError: Failed to load chunk /_next/static/chunks/b2.js from module 2";
    browser.cancelledChunk(`${BASE}/_next/static/chunks/a1.js`);
    browser.pageError(cancelled);
    browser.pageError(missing);
    expect(diagnostics.unexpected).toHaveLength(2);
    browser.loaded();
    expect(diagnostics.unexpected.map(({ text }) => text)).toEqual([missing]);
  });

  it("also forgets the cancelled chunk's error when WebKit reports it just after the next page loaded, not later", () => {
    vi.useFakeTimers();
    try {
      const browser = fakeBrowser();
      const diagnostics = new BrowserDiagnostics().watch(browser.context);
      const cancelled = "ChunkLoadError: Failed to load chunk /_next/static/chunks/a1.js from module 1";
      browser.cancelledChunk(`${BASE}/_next/static/chunks/a1.js`);
      browser.loaded();
      browser.pageError(cancelled);
      browser.pageError("ChunkLoadError: Failed to load chunk /_next/static/chunks/b2.js from module 2");
      expect(diagnostics.unexpected.map(({ text }) => text)).toEqual([
        "ChunkLoadError: Failed to load chunk /_next/static/chunks/b2.js from module 2",
      ]);
      vi.advanceTimersByTime(5000);
      browser.pageError(cancelled);
      expect(diagnostics.unexpected).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("forgets the error of a chunk WebKit refused to request because the page was navigating, but no other", () => {
    vi.useFakeTimers();
    try {
      const browser = fakeBrowser();
      const diagnostics = new BrowserDiagnostics().watch(browser.context);
      const chunkError = (name: string) => `ChunkLoadError: Failed to load chunk /_next/static/chunks/${name}.js from module 1`;
      browser.navigation(`${BASE}/en/settings/webhooks`);
      browser.loaded();
      vi.advanceTimersByTime(5000);
      // Without a pending navigation a chunk error is the page's own, requested or not.
      browser.console(chunkError("idle"), `${BASE}/_next/static/chunks/runtime.js`);
      browser.navigation(`${BASE}/en/settings/webhook-deliveries`);
      browser.console(chunkError("refused"), `${BASE}/_next/static/chunks/runtime.js`);
      browser.requested(`${BASE}/_next/static/chunks/missing.js`);
      browser.console(chunkError("missing"), `${BASE}/_next/static/chunks/runtime.js`);
      browser.loaded();
      browser.console(chunkError("late"), `${BASE}/_next/static/chunks/runtime.js`);
      vi.advanceTimersByTime(5000);
      browser.console(chunkError("later"), `${BASE}/_next/static/chunks/runtime.js`);
      expect(diagnostics.unexpected.map(({ text }) => text)).toEqual([
        chunkError("idle"),
        chunkError("missing"),
        chunkError("later"),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("forgets a framework report of a fetch or chunk the browser cancelled only once the next page loaded", () => {
    for (const [report, errorText, resourceType] of [
      ["TypeError: Load failed", "Load request cancelled", "fetch"],
      ["JSHandle@object", "NS_BINDING_ABORTED", "script"],
    ]) {
      const browser = fakeBrowser();
      const diagnostics = new BrowserDiagnostics().watch(browser.context);
      const view = diagnostics.view(browser.page);
      browser.console(report, `${BASE}/_next/static/chunks/093_a8dahrcqr.js`);
      browser.console(report, `${BASE}/en/dashboard`);
      browser.loaded();
      expect(diagnostics.unexpected).toHaveLength(2);
      browser.console(report, `${BASE}/_next/static/chunks/093_a8dahrcqr.js`);
      browser.abortedLoad(`${BASE}/en/dashboard?_rsc=1a2b`, errorText, resourceType);
      browser.abortedLoad("https://example.test/elsewhere", errorText, resourceType);
      expect(diagnostics.unexpected).toHaveLength(3);
      browser.loaded();
      expect(diagnostics.unexpected.map(({ source }) => source)).toEqual([
        `${BASE}/_next/static/chunks/093_a8dahrcqr.js`,
        `${BASE}/en/dashboard`,
      ]);
      expect(view).toEqual([report, report]);
    }
  });

  it("forgets Next's report of the same cancelled RSC GET only after a following document loads", () => {
    const browser = fakeBrowser();
    const diagnostics = new BrowserDiagnostics().watch(browser.context);
    const view = diagnostics.view(browser.page);
    const report = `Failed to fetch RSC payload for ${BASE}/en/auth/pending. Falling back to browser navigation. TypeError: Load failed`;
    browser.abortedLoad(`${BASE}/en/auth/pending?_rsc=abc`, "Load request cancelled", "fetch", { rsc: true });
    browser.console(report, `${BASE}/_next/static/chunks/runtime.js`);
    expect(view).toEqual([report]);
    browser.navigation(`${BASE}/en/dashboard`);
    expect(view).toEqual([report]);
    browser.loaded();
    expect(view).toEqual([]);
    expect(diagnostics.unexpected).toEqual([]);
  });

  it.each([
    ["another URL", `${BASE}/en/dashboard`, "GET", true, true],
    ["another query", `${BASE}/en/auth/pending?view=other`, "GET", true, true],
    ["an action POST", `${BASE}/en/auth/pending`, "POST", true, true],
    ["an ordinary GET", `${BASE}/en/auth/pending`, "GET", false, true],
    ["a load event without a following navigation", `${BASE}/en/auth/pending`, "GET", true, false],
    ["an external request", "https://example.test/en/auth/pending", "GET", true, true],
  ] as const)("keeps an RSC error when the only cancellation is %s", (_label, url, method, rsc, navigate) => {
    const browser = fakeBrowser();
    const diagnostics = new BrowserDiagnostics().watch(browser.context);
    const report = `Failed to fetch RSC payload for ${BASE}/en/auth/pending. Falling back to browser navigation. TypeError: Load failed`;
    browser.abortedLoad(url, "Load request cancelled", "fetch", { method, rsc });
    browser.console(report, `${BASE}/_next/static/chunks/runtime.js`);
    if (navigate) browser.navigation(`${BASE}/en/dashboard`);
    browser.loaded();
    expect(diagnostics.unexpected.map(({ text }) => text)).toEqual([report]);
  });

  it("keeps failed RSC loads and HTTP errors without cancellation evidence", () => {
    const browser = fakeBrowser();
    const diagnostics = new BrowserDiagnostics().watch(browser.context);
    const report = `Failed to fetch RSC payload for ${BASE}/en/auth/pending. Falling back to browser navigation. TypeError: Load failed`;
    browser.response(`${BASE}/en/auth/pending?_rsc=abc`, 500, "Internal Server Error");
    browser.console(report, `${BASE}/_next/static/chunks/runtime.js`);
    browser.navigation(`${BASE}/en/dashboard`);
    browser.loaded();
    expect(diagnostics.unexpected.map(({ text }) => text)).toEqual([
      "Failed to load resource: the server responded with a status of 500 (Internal Server Error)",
      report,
    ]);
  });

  it("keeps the RSC error of another page", () => {
    const browser = fakeBrowser();
    const other = fakeBrowser();
    const diagnostics = new BrowserDiagnostics().watch(browser.context).watch(other.context);
    const report = `Failed to fetch RSC payload for ${BASE}/en/auth/pending. Falling back to browser navigation. TypeError: Load failed`;
    browser.abortedLoad(`${BASE}/en/auth/pending?_rsc=abc`, "Load request cancelled", "fetch", { rsc: true });
    other.console(report, `${BASE}/_next/static/chunks/runtime.js`);
    browser.navigation(`${BASE}/en/dashboard`);
    other.navigation(`${BASE}/en/dashboard`);
    browser.loaded();
    other.loaded();
    expect(diagnostics.unexpected.map(({ text }) => text)).toEqual([report]);
  });

  it("fails a passing test on unexpected diagnostics and only attaches them to a failed, expected-to-fail or skipped one", async () => {
    const browser = fakeBrowser();
    const diagnostics = new BrowserDiagnostics().watch(browser.context);
    browser.response(`${BASE}/api/v1/records/query`, 404, "Not Found");

    await expect(diagnostics.verify(fakeTestInfo("passed"))).rejects.toThrow(
      `console: ${NOT_FOUND} (${BASE}/api/v1/records/query)`,
    );
    for (const testInfo of [
      fakeTestInfo("failed"),
      fakeTestInfo("failed", "failed"),
      fakeTestInfo("skipped", "skipped"),
    ]) {
      await expect(diagnostics.verify(testInfo)).resolves.toBeUndefined();
      expect(testInfo.attach).toHaveBeenCalledWith(
        "browser-diagnostics",
        expect.objectContaining({ contentType: "application/json" }),
      );
    }
  });

  it("passes a clean test without an attachment and shares one registry per test", async () => {
    const browser = fakeBrowser();
    const testInfo = fakeTestInfo("passed");
    const diagnostics = BrowserDiagnostics.of(testInfo).watch(browser.context);
    expect(BrowserDiagnostics.of(testInfo)).toBe(diagnostics);
    expect(BrowserDiagnostics.ofPage(browser.page)).toBe(diagnostics);
    await expect(diagnostics.verify(testInfo)).resolves.toBeUndefined();
    expect(testInfo.attach).not.toHaveBeenCalled();
  });
});
