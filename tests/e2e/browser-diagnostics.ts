import type { BrowserContext, ConsoleMessage, Page, Request, TestInfo } from "@playwright/test";

import { chunkLoadErrorChunk, isAppConsoleError, isBenignPageError, webkitCancelledChunk } from "./browser-noise";

export type BrowserDiagnostic = { kind: "pageerror" | "console"; text: string; source: string; page: Page | null };

/**
 * A diagnostic a test causes on purpose. It matches one kind, a text pattern and, for console messages, the URL of
 * the resource the message is about; `page` narrows it to one page. At most `limit` (default 1) events count as
 * expected, the rest stay unexpected, and `events` lets the test assert that the expected event happened.
 */
export type ExpectedDiagnosticRule = {
  kind: BrowserDiagnostic["kind"];
  text: RegExp;
  source?: (url: URL) => boolean;
  page?: Page;
  limit?: number;
};
export type ExpectedDiagnostic = { readonly events: readonly BrowserDiagnostic[] };

const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "[::1]"];

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

  watch(context: BrowserContext) {
    if (byContext.get(context) === this) return this;
    byContext.set(context, this);
    context.on("weberror", (error) => {
      const { message } = error.error();
      if (!isBenignPageError(message))
        this.record({ kind: "pageerror", text: message, source: "", page: error.page() });
    });
    context.on("console", (message: ConsoleMessage) => {
      if (isAppConsoleError(message))
        this.record({ kind: "console", text: message.text(), source: message.location().url, page: message.page() });
    });
    context.on("requestfailed", (request: Request) => this.noteCancelledChunk(request));
    const watchPage = (page: Page) => page.on("domcontentloaded", () => this.dropCancelledChunkErrors(page));
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
    const owner = this.rules.find(
      ({ rule, events }) => events.length < (rule.limit ?? 1) && matchesExpectedDiagnostic(rule, diagnostic),
    );
    if (owner) {
      owner.events.push(diagnostic);
      return;
    }
    this.unexpected.push(diagnostic);
    if (diagnostic.page) for (const texts of this.views.get(diagnostic.page) ?? []) texts.push(diagnostic.text);
  }

  private noteCancelledChunk(request: Request) {
    const chunk = webkitCancelledChunk(request);
    const page = chunk ? requestPage(request) : null;
    if (!chunk || !page) return;
    this.cancelledChunks.set(page, (this.cancelledChunks.get(page) ?? new Set()).add(chunk));
  }

  /** WebKit cancels chunk loads when a page navigates away; their ChunkLoadError is gone once the next page loads. */
  private dropCancelledChunkErrors(page: Page) {
    const chunks = this.cancelledChunks.get(page);
    if (!chunks) return;
    this.cancelledChunks.delete(page);
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
 * The browser reports a document answered with 404 as a failed resource load. Only documents `page` navigated to that
 * answered 404 are expected; any other failed load, an API call or a chunk included, stays unexpected.
 */
export function expectNotFoundDocuments(page: Page) {
  const documents = new Set<string>();
  page.on("response", (response) => {
    if (response.status() === 404 && response.request().isNavigationRequest()) documents.add(response.url());
  });
  return BrowserDiagnostics.ofPage(page).expect({
    kind: "console",
    text: /^Failed to load resource: the server responded with a status of 404/,
    source: (url) => documents.has(url.href),
    page,
    limit: Number.POSITIVE_INFINITY,
  });
}
