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
  const page = { on: pageEvents.on, context: () => context } as unknown as Page;
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
        frame: () => ({ page: () => page }),
      }),
    loaded: () => pageEvents.emit("domcontentloaded"),
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
    browser.console(NOT_FOUND, `${BASE}/en/records/unknown`);
    browser.console(NOT_FOUND, `${BASE}/api/v1/records/query`);
    browser.console(NOT_FOUND, `${BASE}/en/records/unknown`);
    browser.pageError("ChunkLoadError: Failed to load chunk /_next/static/chunks/app.js from module 7");
    browser.console("Failed to load resource: net::ERR_BLOCKED_BY_CLIENT", "https://flagcdn.com/w40/de.png");
    browser.pageError("ResizeObserver loop completed with undelivered notifications.");

    expect(notFound.events.map(({ source }) => source)).toEqual([`${BASE}/en/records/unknown`]);
    expect(diagnostics.unexpected.map(({ kind, source }) => [kind, source])).toEqual([
      ["console", `${BASE}/api/v1/records/query`],
      ["console", `${BASE}/en/records/unknown`],
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
    other.console(
      "Failed to load resource: the server responded with a status of 422 ()",
      `${BASE}/api/agent/messages`,
    );
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

  it("fails a passing test on unexpected diagnostics and only attaches them to a failed, expected-to-fail or skipped one", async () => {
    const browser = fakeBrowser();
    const diagnostics = new BrowserDiagnostics().watch(browser.context);
    browser.console(NOT_FOUND, `${BASE}/api/v1/records/query`);

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
