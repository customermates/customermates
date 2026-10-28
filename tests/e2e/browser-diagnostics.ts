import type { BrowserContext, ConsoleMessage, Page, Request, Response, TestInfo } from "@playwright/test";

import {
  chunkLoadErrorChunk,
  chunkPathname,
  isAbortedLoadReport,
  isAbortedPageLoad,
  isAppConsoleError,
  isBenignPageError,
  cancelledChunk,
} from "./browser-noise";

/** `document` marks a failed load of a document a frame navigated to, as opposed to a fetch, script or image. */
export type BrowserDiagnostic = {
  kind: "pageerror" | "console";
  text: string;
  source: string;
  page: Page | null;
  document?: boolean;
};

/**
 * A diagnostic a test causes on purpose. It matches one kind, a text pattern and, for console messages, the URL of
 * the resource the message is about; `page` narrows it to one page. At most `limit` (default 1) events count as
 * expected, the rest stay unexpected, and `events` lets the test assert that the expected event happened. `document`
 * limits it to failed loads of navigated documents.
 */
export type ExpectedDiagnosticRule = {
  kind: BrowserDiagnostic["kind"];
  text: RegExp;
  source?: (url: URL) => boolean;
  page?: Page;
  document?: boolean;
  limit?: number;
};
export type ExpectedDiagnostic = { readonly events: readonly BrowserDiagnostic[] };

const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "[::1]"];
/** How long an HTTP error of the app waits for its request to finish or fail before it counts anyway. */
const HTTP_ERROR_GRACE_MS = 2000;
const HTTP_ERROR_REPORT = /^Failed to load resource: the server responded with a status of (\d{3})\b/;

function sourceUrl(source: string) {
  try {
    return new URL(source);
  } catch {
    return null;
  }
}

/** The sign-in fixtures abort every request to another origin; the browser reports each as a failed resource load. */
export function isSandboxedResourceFailure(diagnostic: Pick<BrowserDiagnostic, "kind" | "text" | "source">) {
  const url = sourceUrl(diagnostic.source);
  return (
    diagnostic.kind === "console" &&
    diagnostic.text.startsWith("Failed to load resource") &&
    url !== null &&
    ["http:", "https:"].includes(url.protocol) &&
    !LOOPBACK_HOSTS.includes(url.hostname)
  );
}

export function matchesExpectedDiagnostic(rule: ExpectedDiagnosticRule, diagnostic: BrowserDiagnostic) {
  if (rule.kind !== diagnostic.kind || !rule.text.test(diagnostic.text)) return false;
  if (rule.page && rule.page !== diagnostic.page) return false;
  if (rule.document && !diagnostic.document) return false;
  if (!rule.source) return true;
  const url = sourceUrl(diagnostic.source);
  return url !== null && rule.source(url);
}

export function describeDiagnostic({ kind, text, source }: Pick<BrowserDiagnostic, "kind" | "text" | "source">) {
  return source ? `${kind}: ${text} (${source})` : `${kind}: ${text}`;
}

function requestPage(request: Request) {
  try {
    return request.frame().page();
  } catch {
    return null;
  }
}

function isLoopbackHttp(source: string) {
  const url = sourceUrl(source);
  return url !== null && ["http:", "https:"].includes(url.protocol) && LOOPBACK_HOSTS.includes(url.hostname);
}

/**
 * A load of the app answered with an HTTP error status (4xx or 5xx), built from the response. Chromium and WebKit also
 * log most of these as "Failed to load resource", but not all (WebKit logs no failed document) and Firefox logs none
 * of them, so the response is the one source on every browser. The text is Chromium's, which the rules match.
 */
export function httpErrorDiagnostic(
  response: Pick<Response, "status" | "statusText" | "url" | "frame" | "request">,
): BrowserDiagnostic | null {
  if (response.status() < 400 || !isLoopbackHttp(response.url())) return null;
  let page: Page | null = null;
  try {
    page = response.frame().page();
  } catch {
    page = null;
  }
  const statusText = response.statusText();
  return {
    kind: "console",
    text: `Failed to load resource: the server responded with a status of ${response.status()}${statusText ? ` (${statusText})` : ""}`,
    source: response.url(),
    page,
    document: response.request().isNavigationRequest(),
  };
}

/** The browser's own console copy of an HTTP error of the app, which `httpErrorDiagnostic` may report as well. */
export function isHttpErrorReport(diagnostic: Pick<BrowserDiagnostic, "kind" | "text" | "source">) {
  return diagnostic.kind === "console" && HTTP_ERROR_REPORT.test(diagnostic.text) && isLoopbackHttp(diagnostic.source);
}

function httpErrorKey(status: number | string, url: string) {
  return `${status} ${url}`;
}

/**
 * Chromium logs a failed load only once it completed: not for a request that was aborted, nor once its frame was
 * detached, its page closed or its page had started a navigation away from the document that made it.
 */
function isAbandonedRequest(request: Request, page: Page | null, navigatedAway: boolean) {
  if (page?.isClosed()) return true;
  try {
    if (request.frame().isDetached()) return true;
  } catch {
    return false;
  }
  return navigatedAway && !request.isNavigationRequest();
}

const byTest = new WeakMap<TestInfo, BrowserDiagnostics>();
const byContext = new WeakMap<BrowserContext, BrowserDiagnostics>();

/**
 * Collects page errors and console errors of every page in the contexts a test watches, popups included, from before
 * the first navigation until the test ends. Engine noise and the sandbox's own blocked requests are dropped, expected
 * diagnostics are matched against the test's rules, and everything else is unexpected: the fixtures fail an otherwise
 * passing test on it and attach the diagnostics to a test that failed anyway.
 */
export class BrowserDiagnostics {
  static of(testInfo: TestInfo) {
    const known = byTest.get(testInfo);
    if (known) return known;
    const diagnostics = new BrowserDiagnostics();
    byTest.set(testInfo, diagnostics);
    return diagnostics;
  }

  static ofPage(page: Page) {
    return byContext.get(page.context()) ?? new BrowserDiagnostics().watch(page.context());
  }

  readonly unexpected: BrowserDiagnostic[] = [];
  private readonly rules: Array<{ rule: ExpectedDiagnosticRule; events: BrowserDiagnostic[] }> = [];
  private readonly views = new Map<Page, string[][]>();
  private readonly cancelledChunks = new Map<Page, Set<string>>();
  private readonly settledChunks = new Map<Page, { chunks: Set<string>; at: number }>();
  private readonly abortedLoads = new Set<Page>();
  private readonly abortedResourceLoads = new Map<Page, Map<string, number>>();
  private readonly navigations = new Map<Page, { requested: Set<string>; loadedAt?: number }>();
  private readonly sinceLoad = new Map<Page, BrowserDiagnostic[]>();
  private readonly generations = new Map<Page, number>();
  private readonly requestGenerations = new WeakMap<Request, number>();
  private readonly pendingErrors = new Map<
    Request,
    { diagnostic: BrowserDiagnostic; timer: ReturnType<typeof setTimeout> }
  >();
  private readonly settledRequests = new WeakMap<Request, { failed: boolean }>();
  private readonly answeredErrors = new Map<string, Request[]>();
  private readonly consoleErrors = new Map<string, BrowserDiagnostic[]>();
  private readonly pendingConsole = new Set<Promise<void>>();

  watch(context: BrowserContext) {
    if (byContext.get(context) === this) return this;
    byContext.set(context, this);
    context.on("weberror", (error) => {
      const { message } = error.error();
      if (!isBenignPageError(message))
        this.record({ kind: "pageerror", text: message, source: "", page: error.page() });
    });
    context.on("console", (message: ConsoleMessage) => {
      if (!isAppConsoleError(message)) return;
      const diagnostic: BrowserDiagnostic = {
        kind: "console",
        text: message.text(),
        source: message.location().url,
        page: message.page(),
      };
      if (diagnostic.text === "Error" && message.args()[0]) {
        const pending = message.args()[0]
          .evaluate((value) => value instanceof Error ? String(value) : null)
          .catch(() => null)
          .then((detail) => this.record({ ...diagnostic, text: detail ?? diagnostic.text }));
        this.pendingConsole.add(pending);
        void pending.finally(() => this.pendingConsole.delete(pending));
      } else if (isHttpErrorReport(diagnostic)) this.noteHttpErrorReport(diagnostic);
      else this.record(diagnostic);
    });
    context.on("request", (request: Request) => this.noteRequest(request));
    context.on("response", (response: Response) => this.noteResponse(response));
    context.on("requestfinished", (request: Request) => this.settleHttpError(request, false));
    context.on("requestfailed", (request: Request) => {
      this.settleHttpError(request, true);
      this.noteCancelledChunk(request);
      this.noteAbortedLoad(request);
    });
    const watchPage = (page: Page) =>
      page.on("domcontentloaded", () => {
        const navigation = this.navigations.get(page);
        if (navigation && navigation.loadedAt === undefined) navigation.loadedAt = Date.now();
        this.dropCancelledChunkErrors(page);
        this.dropAbortedLoadReports(page);
        this.sinceLoad.delete(page);
      });
    context.pages().forEach(watchPage);
    context.on("page", watchPage);
    return this;
  }

  expect(rule: ExpectedDiagnosticRule): ExpectedDiagnostic {
    const entry = { rule, events: [] as BrowserDiagnostic[] };
    this.rules.push(entry);
    return entry;
  }

  /** The unexpected diagnostics of `page` from now on, as texts, for tests that check them at a specific step. */
  view(page: Page) {
    const texts: string[] = [];
    this.views.set(page, [...(this.views.get(page) ?? []), texts]);
    return texts;
  }

  async verify(testInfo: TestInfo) {
    await Promise.all(this.pendingConsole);
    for (const request of [...this.pendingErrors.keys()]) this.confirmHttpError(request);
    const expected = this.rules.flatMap(({ events }) => events);
    if (this.unexpected.length > 0 || expected.length > 0)
      await testInfo.attach("browser-diagnostics", {
        contentType: "application/json",
        body: JSON.stringify(
          {
            unexpected: this.unexpected.map(describeDiagnostic),
            expected: expected.map(describeDiagnostic),
          },
          null,
          2,
        ),
      });
    const passing = testInfo.status === "passed" && testInfo.expectedStatus === "passed";
    if (passing && this.unexpected.length > 0)
      throw new Error(
        `Unexpected page or console errors:\n${this.unexpected.map((diagnostic) => `  ${describeDiagnostic(diagnostic)}`).join("\n")}`,
      );
  }

  private record(diagnostic: BrowserDiagnostic) {
    if (isSandboxedResourceFailure(diagnostic)) return;
    const settled = diagnostic.page ? this.settledChunks.get(diagnostic.page) : undefined;
    if (settled && Date.now() - settled.at < 3000 && settled.chunks.has(chunkLoadErrorChunk(diagnostic.text) ?? "")) return;
    if (this.isRefusedChunk(diagnostic)) return;
    const owner = this.rules.find(
      ({ rule, events }) => events.length < (rule.limit ?? 1) && matchesExpectedDiagnostic(rule, diagnostic),
    );
    if (owner) {
      owner.events.push(diagnostic);
      return;
    }
    this.unexpected.push(diagnostic);
    if (!diagnostic.page) return;
    this.sinceLoad.set(diagnostic.page, [...(this.sinceLoad.get(diagnostic.page) ?? []), diagnostic]);
    for (const texts of this.views.get(diagnostic.page) ?? []) texts.push(diagnostic.text);
  }

  /** Notes each document navigation of a page's main frame and the chunks the page requested since it started. */
  private noteRequest(request: Request) {
    const page = requestPage(request);
    if (!page) return;
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      if (!request.redirectedFrom()) {
        this.navigations.set(page, { requested: new Set() });
        this.generations.set(page, (this.generations.get(page) ?? 0) + 1);
      }
      return;
    }
    this.requestGenerations.set(request, this.generations.get(page) ?? 0);
    const chunk = chunkPathname(request.url());
    if (chunk) this.navigations.get(page)?.requested.add(chunk);
  }

  /**
   * Once a document navigation has started, WebKit refuses the chunk loads the old document still starts (a dynamic
   * import its hydration reaches only then) without sending a request, and the old document reports a ChunkLoadError,
   * at the latest just after the next page loaded. A chunk that really failed was requested, so its error stays.
   */
  private isRefusedChunk(diagnostic: BrowserDiagnostic) {
    const chunk = chunkLoadErrorChunk(diagnostic.text);
    const navigation = chunk && diagnostic.page ? this.navigations.get(diagnostic.page) : undefined;
    if (!chunk || !navigation) return false;
    if (navigation.loadedAt !== undefined && Date.now() - navigation.loadedAt >= 3000) return false;
    return !navigation.requested.has(chunk);
  }

  /**
   * An HTTP error of the app counts once the browser confirms it: by its console copy (Chromium and WebKit log one as
   * the response arrives, even for a script they then report as failed), by the request finishing, or after
   * HTTP_ERROR_GRACE_MS. A request that fails before is dropped, as is one whose page closed, frame was detached or
   * page navigated away from the document that sent it. A console copy that arrived first is withdrawn in favour of
   * the response, which knows whether it was a document.
   */
  private noteResponse(response: Response) {
    const diagnostic = httpErrorDiagnostic(response);
    if (!diagnostic) return;
    const request = response.request();
    const key = httpErrorKey(response.status(), response.url());
    const copy = this.consoleErrors.get(key)?.shift();
    if (!copy) this.answeredErrors.set(key, [...(this.answeredErrors.get(key) ?? []), request]);
    this.pendingErrors.set(request, {
      diagnostic,
      timer: setTimeout(() => this.confirmHttpError(request), HTTP_ERROR_GRACE_MS),
    });
    if (copy) {
      this.forget(new Set([copy]));
      this.confirmHttpError(request);
      return;
    }
    const settled = this.settledRequests.get(request);
    if (settled) this.settleHttpError(request, settled.failed);
  }

  /** Chromium can report a request as finished or failed before its response, so either order settles the error. */
  private settleHttpError(request: Request, failed: boolean) {
    if (!this.pendingErrors.has(request)) {
      this.settledRequests.set(request, { failed });
      return;
    }
    if (failed) this.dropHttpError(request);
    else this.confirmHttpError(request);
  }

  private dropHttpError(request: Request) {
    const pending = this.pendingErrors.get(request);
    if (!pending) return null;
    clearTimeout(pending.timer);
    this.pendingErrors.delete(request);
    return pending.diagnostic;
  }

  private confirmHttpError(request: Request) {
    const diagnostic = this.dropHttpError(request);
    if (!diagnostic) return;
    const page = diagnostic.page;
    const generation = this.requestGenerations.get(request);
    const navigatedAway = page !== null && generation !== undefined && (this.generations.get(page) ?? 0) > generation;
    if (!isAbandonedRequest(request, page, navigatedAway)) this.record(diagnostic);
  }

  /** A console report of an HTTP error stands for a request without a response event, unless one answered it. */
  private noteHttpErrorReport(diagnostic: BrowserDiagnostic) {
    const key = httpErrorKey(HTTP_ERROR_REPORT.exec(diagnostic.text)?.[1] ?? "", diagnostic.source);
    const request = this.answeredErrors.get(key)?.shift();
    if (request) {
      this.confirmHttpError(request);
      return;
    }
    this.consoleErrors.set(key, [...(this.consoleErrors.get(key) ?? []), diagnostic]);
    this.record(diagnostic);
  }

  /** Withdraws diagnostics recorded earlier, from the unexpected ones, the expected events and the pages' views. */
  private forget(diagnostics: Set<BrowserDiagnostic>) {
    const kept = this.unexpected.filter((diagnostic) => !diagnostics.has(diagnostic));
    this.unexpected.splice(0, this.unexpected.length, ...kept);
    for (const { events } of this.rules)
      events.splice(0, events.length, ...events.filter((event) => !diagnostics.has(event)));
    for (const diagnostic of diagnostics) {
      if (!diagnostic.page) continue;
      const since = this.sinceLoad.get(diagnostic.page);
      if (since) this.sinceLoad.set(diagnostic.page, since.filter((entry) => entry !== diagnostic));
      for (const texts of this.views.get(diagnostic.page) ?? []) {
        const index = texts.lastIndexOf(diagnostic.text);
        if (index >= 0) texts.splice(index, 1);
      }
    }
  }

  private noteCancelledChunk(request: Request) {
    const chunk = cancelledChunk(request);
    const page = chunk ? requestPage(request) : null;
    if (!chunk || !page) return;
    this.cancelledChunks.set(page, (this.cancelledChunks.get(page) ?? new Set()).add(chunk));
  }

  private noteAbortedLoad(request: Request) {
    const page = isAbortedPageLoad(request) ? requestPage(request) : null;
    if (!page) return;
    this.abortedLoads.add(page);
    const generation = this.requestGenerations.get(request);
    if (
      generation !== undefined &&
      (request.resourceType() === "font" ||
        (request.resourceType() === "fetch" && request.method() === "GET" && request.headers().rsc === "1"))
    ) {
      const loads = this.abortedResourceLoads.get(page) ?? new Map<string, number>();
      loads.set(request.url(), generation);
      this.abortedResourceLoads.set(page, loads);
    }
  }

  /** A load the browser cancelled for a document navigation is reported before the next page loads; forget it then. */
  private dropAbortedLoadReports(page: Page) {
    if (!this.abortedLoads.delete(page)) return;
    const cancelledUrls = new Set<string>();
    for (const [url, generation] of this.abortedResourceLoads.get(page) ?? [])
      if ((this.generations.get(page) ?? 0) > generation) cancelledUrls.add(url);
    this.abortedResourceLoads.delete(page);
    const reports = new Set(
      (this.sinceLoad.get(page) ?? []).filter((diagnostic) => isAbortedLoadReport(diagnostic, cancelledUrls)),
    );
    if (reports.size > 0) this.forget(reports);
  }

  /** WebKit cancels chunk loads when a page navigates away; their ChunkLoadError is gone once the next page loads. */
  private dropCancelledChunkErrors(page: Page) {
    const chunks = this.cancelledChunks.get(page);
    if (!chunks) return;
    this.cancelledChunks.delete(page);
    // WebKit can report the ChunkLoadError of a chunk it cancelled just after the next page has loaded; it is the same
    // noise. A failure of that chunk seconds later is the new page's own and stays unexpected.
    this.settledChunks.set(page, { chunks, at: Date.now() });
    const cancelled = (text: string) => chunks.has(chunkLoadErrorChunk(text) ?? "");
    const kept = this.unexpected.filter((diagnostic) => diagnostic.page !== page || !cancelled(diagnostic.text));
    this.unexpected.splice(0, this.unexpected.length, ...kept);
    for (const texts of this.views.get(page) ?? [])
      texts.splice(0, texts.length, ...texts.filter((text) => !cancelled(text)));
  }
}

/** The unexpected page and console errors of `page`, collected by the test's diagnostics registry. */
export function collectPageErrors(page: Page) {
  return BrowserDiagnostics.ofPage(page).view(page);
}

/** Email bodies render in a sandboxed srcdoc frame without scripts; the browser reports each script it blocks there. */
export function expectBlockedEmailScripts(page: Page) {
  return BrowserDiagnostics.ofPage(page).expect({
    kind: "console",
    text: /^Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set\.$/,
    page,
    limit: Number.POSITIVE_INFINITY,
  });
}

/**
 * A document answered with 404 is a failed load. Only documents `page` navigated to that answered 404 are expected;
 * any other failed load, an API call or a chunk included, stays unexpected.
 */
export function expectNotFoundDocuments(page: Page) {
  return BrowserDiagnostics.ofPage(page).expect({
    kind: "console",
    text: /^Failed to load resource: the server responded with a status of 404/,
    document: true,
    page,
    limit: Number.POSITIVE_INFINITY,
  });
}
