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
  const mainFrame = { page: () => page };
  const page = { on: pageEvents.on, context: () => context, mainFrame: () => mainFrame } as unknown as Page;
  const context = { on: contextEvents.on, pages: () => [page] } as unknown as BrowserContext;
  return {
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
    abortedLoad: (url: string, errorText = "Load request cancelled", resourceType = "fetch") =>
      contextEvents.emit("requestfailed", {
        url: () => url,
        failure: () => ({ errorText }),
        resourceType: () => resourceType,
        frame: () => ({ page: () => page }),
      }),
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
    response: (url: string, status: number, statusText = "", isDocument = false) =>
      contextEvents.emit("response", {
        url: () => url,
        status: () => status,
        statusText: () => statusText,
        frame: () => mainFrame,
        request: () => ({ isNavigationRequest: () => isDocument }),
      }),
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
