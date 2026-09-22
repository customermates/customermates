import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isPublicPageAddress, readPublicPage } from "../public-page-reader";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  httpRequest: vi.fn(),
  httpsRequest: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:http", () => ({ request: mocks.httpRequest }));
vi.mock("node:https", () => ({ request: mocks.httpsRequest }));

type Fixture = {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string | Buffer | readonly Buffer[];
  fail?: boolean;
};
const fixtures: Fixture[] = [];
const responses: Readable[] = [];

function request(_url: URL, options: { signal: AbortSignal }, callback: (value: unknown) => void) {
  const fixture = fixtures.shift() ?? {};
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    end: () => {
      queueMicrotask(() => {
        if (fixture.fail) {
          emitter.emit("error", new Error("synthetic connection failure"));
          return;
        }
        const body =
          fixture.body ??
          "<html><head><title>Example</title></head><body><h1>Company</h1><p>Useful public company information.</p></body></html>";
        const response = Object.assign(Readable.from(Array.isArray(body) ? body : [body]), {
          statusCode: fixture.statusCode ?? 200,
          headers: fixture.headers ?? {
            "content-type": "text/html; charset=utf-8",
          },
        });
        responses.push(response);
        const onAbort = () => response.destroy(new Error("synthetic abort"));
        options.signal.addEventListener("abort", onAbort, { once: true });
        response.once("close", () => options.signal.removeEventListener("abort", onAbort));
        callback(response);
      });
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.length = 0;
  responses.length = 0;
  mocks.lookup.mockResolvedValue([{ address: "93.184.215.14", family: 4 }]);
  mocks.httpRequest.mockImplementation(request);
  mocks.httpsRequest.mockImplementation(request);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("isPublicPageAddress", () => {
  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "100.100.100.200",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.0.2.1",
    "192.88.99.1",
    "192.168.0.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
    "168.63.129.16",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:8.8.8.8",
    "::ffff:7f00:1",
    "64:ff9b::7f00:1",
    "64:ff9b:1::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001::1",
    "2001:2::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "3ffe::1",
    "3fff::1",
    "not-an-address",
  ])("blocks non-public and transition address %s", (address) => {
    expect(isPublicPageAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "93.184.215.14", "172.32.0.1", "2606:4700:4700::1111", "2001:4860:4860::8888"])(
    "accepts global public address %s",
    (address) => expect(isPublicPageAddress(address)).toBe(true),
  );
});

describe("readPublicPage", () => {
  it("pins DNS while preserving the hostname, disables connection reuse, and returns bounded visible content", async () => {
    const result = await readPublicPage({ url: "https://example.com/" });
    expect(result).toEqual({
      ok: true,
      url: "https://example.com/",
      title: "Example",
      text: "Company\n\nUseful public company information.",
      links: [],
      truncated: false,
    });
    expect(mocks.lookup).toHaveBeenCalledWith("example.com", {
      all: true,
      verbatim: true,
    });
    const [url, options] = mocks.httpsRequest.mock.calls[0];
    expect(url.hostname).toBe("example.com");
    expect(options).toMatchObject({
      agent: false,
      autoSelectFamily: false,
      family: 4,
      maxHeaderSize: 16_384,
    });
    expect(options.headers).not.toHaveProperty("Cookie");
    expect(options.headers).not.toHaveProperty("Authorization");
    const callback = vi.fn();
    options.lookup("example.com", {}, callback);
    await new Promise((resolve) => process.nextTick(resolve));
    expect(callback).toHaveBeenCalledWith(null, "93.184.215.14", 4);
    const allCallback = vi.fn();
    options.lookup("ignored.example.com", { all: true }, allCallback);
    await new Promise((resolve) => process.nextTick(resolve));
    expect(allCallback).toHaveBeenCalledWith(null, [{ address: "93.184.215.14", family: 4 }]);
    expect(responses[0].destroyed).toBe(true);
  });

  it.each([
    "https://localhost/",
    "https://127.0.0.1/",
    "https://2130706433/",
    "https://0x7f000001/",
    "https://[::1]/",
    "https://user:password@example.com/",
    "https://example.com:8443/",
    "file:///etc/passwd",
    "https://example.com/unsafe\npath",
  ])("rejects unsafe URL %s before DNS or network access", async (url) => {
    expect(await readPublicPage({ url })).toEqual({
      ok: false,
      reason: "invalid_url",
    });
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
  });

  it("rejects a mismatched allowlist and private-domain sibling before DNS", async () => {
    expect(
      await readPublicPage({
        url: "https://example.com/",
        allowedDomain: "other.com",
      }),
    ).toEqual({ ok: false, reason: "outside_domain" });
    expect(
      await readPublicPage({
        url: "https://other.github.io/",
        allowedDomain: "tenant.github.io",
      }),
    ).toEqual({ ok: false, reason: "outside_domain" });
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it.each([
    [{ address: "127.0.0.1", family: 4 }],
    [
      { address: "93.184.215.14", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ],
    [{ address: "::ffff:93.184.215.14", family: 6 }],
    [{ address: "93.184.215.14", family: 6 }],
    [],
  ])("rejects non-public, mixed, mismatched, and empty DNS answers", async (...addresses) => {
    mocks.lookup.mockResolvedValue(addresses);
    expect(await readPublicPage({ url: "https://example.com/" })).toEqual({
      ok: false,
      reason: "blocked_address",
    });
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
  });

  it("pins IPv6 DNS answers without converting or changing the TLS hostname", async () => {
    mocks.lookup.mockResolvedValue([{ address: "2606:4700:4700::1111", family: 6 }]);
    expect((await readPublicPage({ url: "https://example.com/" })).ok).toBe(true);
    const callback = vi.fn();
    mocks.httpsRequest.mock.calls[0][1].lookup("example.com", {}, callback);
    await new Promise((resolve) => process.nextTick(resolve));
    expect(callback).toHaveBeenCalledWith(null, "2606:4700:4700::1111", 6);
  });

  it("resolves and pins every redirect independently, including rebinding on the same host", async () => {
    fixtures.push({ statusCode: 302, headers: { location: "/en" } });
    mocks.lookup.mockResolvedValueOnce([{ address: "93.184.215.14", family: 4 }]);
    mocks.lookup.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    expect(await readPublicPage({ url: "https://example.com/" })).toEqual({
      ok: false,
      reason: "blocked_address",
    });
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
    expect(mocks.httpsRequest).toHaveBeenCalledTimes(1);
    expect(responses[0].destroyed).toBe(true);
  });

  it("follows same-domain redirects and returns their final source URL", async () => {
    fixtures.push({
      statusCode: 301,
      headers: { location: "https://www.example.com/en" },
    });
    const result = await readPublicPage({ url: "http://example.com/" });
    expect(result).toMatchObject({
      ok: true,
      url: "https://www.example.com/en",
    });
    expect(mocks.httpRequest).toHaveBeenCalledTimes(1);
    expect(mocks.httpsRequest).toHaveBeenCalledTimes(1);
  });

  it("requests functional query parameters unchanged and strips only the fragment", async () => {
    fixtures.push({
      body: "<html><body><p>Details for offering 42.</p></body></html>",
    });
    const result = await readPublicPage({
      url: "https://example.com/index.php?id=42&lang=en#details",
    });
    expect(mocks.httpsRequest.mock.calls[0][0].href).toBe("https://example.com/index.php?id=42&lang=en");
    expect(result).toMatchObject({
      ok: true,
      url: "https://example.com/index.php?id=42&lang=en",
      text: "Details for offering 42.",
    });
  });

  it("preserves query-only redirects and resolves links against the actual final page", async () => {
    fixtures.push(
      { statusCode: 302, headers: { location: "?id=43#details" } },
      {
        body: '<html><body><p>Offering 43.</p><a href="?id=44#overview">Offering 44</a><a href="?id=44#details">Duplicate</a><a href="?id=45">Offering 45</a></body></html>',
      },
    );
    const result = await readPublicPage({
      url: "https://example.com/index.php?id=42#overview",
    });
    expect(mocks.httpsRequest.mock.calls.map(([url]) => url.href)).toEqual([
      "https://example.com/index.php?id=42",
      "https://example.com/index.php?id=43",
    ]);
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: true,
      url: "https://example.com/index.php?id=43",
      links: [
        { url: "https://example.com/index.php?id=44", title: "Offering 44" },
        { url: "https://example.com/index.php?id=45", title: "Offering 45" },
      ],
    });
  });

  it.each([
    ["https://evil.com/", "outside_domain"],
    ["https://evil.com/index.php?id=42", "outside_domain"],
    ["https://127.0.0.1/", "invalid_url"],
    ["http://example.com/insecure", "invalid_url"],
    ["https://user:secret@example.com/", "invalid_url"],
    ["https://example.com:8080/", "invalid_url"],
  ])("blocks redirect to %s before a second network request", async (location, reason) => {
    fixtures.push({ statusCode: 302, headers: { location } });
    expect(await readPublicPage({ url: "https://example.com/" })).toEqual({
      ok: false,
      reason,
    });
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });

  it("caps redirect chains", async () => {
    fixtures.push(
      ...Array.from({ length: 4 }, () => ({
        statusCode: 302,
        headers: { location: "/loop" },
      })),
    );
    expect(await readPublicPage({ url: "https://example.com/" })).toEqual({
      ok: false,
      reason: "redirect_limit",
    });
    expect(mocks.httpsRequest).toHaveBeenCalledTimes(4);
  });

  it("removes hidden content, resolves only safe same-domain links, and does not crawl", async () => {
    fixtures.push({
      body: '<html><head><title>Our &amp; Company</title><script>secret()</script><style>hidden-css</style></head><body><h1>Welcome</h1><p>We help teams.</p><a href="/about#team">About &amp; team</a><a href="https://www.example.com/pricing">Pricing</a><a href="/about?campaign=1">Duplicate</a><a href="https://other.com">Other</a><a href="javascript:alert(1)">Ignore</a><form>Private input</form><noscript>Hidden</noscript></body></html>',
    });
    const result = await readPublicPage({ url: "https://example.com/en" });
    expect(result).toMatchObject({
      ok: true,
      title: "Our & Company",
      links: [
        { url: "https://example.com/about", title: "About & team" },
        { url: "https://example.com/about?campaign=1", title: "Duplicate" },
        { url: "https://www.example.com/pricing", title: "Pricing" },
      ],
    });
    if (!result.ok) throw new Error("expected page");
    expect(result.text).toContain("We help teams.");
    expect(result.text).not.toMatch(/secret|hidden-css|Private input|Hidden/);
    expect(mocks.httpsRequest).toHaveBeenCalledTimes(1);
  });

  it("selects category-diverse evidence links instead of the first repeated feature links", async () => {
    const featureLeaves = Array.from(
      { length: 50 },
      (_, index) => `<a href="/features/feature-${index}">Feature ${index}</a>`,
    ).join("");
    fixtures.push({
      body: `<html><body><main><h1>Example</h1><p>Useful overview.</p>${featureLeaves}<a href="/features">All features</a><a href="/compare">Compare alternatives</a><a href="/docs">Documentation</a><a href="/blog">Insights</a><a href="/about">About us</a><a href="/for/customer-support">For customer support</a></main></body></html>`,
    });

    const result = await readPublicPage({ url: "https://example.com/" });

    if (!result.ok) throw new Error("expected page");
    expect(result.links).toHaveLength(7);
    expect(result.links.map(({ url }) => new URL(url).pathname)).toEqual(
      expect.arrayContaining(["/features", "/compare", "/docs", "/blog", "/about", "/for/customer-support"]),
    );
    expect(result.links.filter(({ url }) => new URL(url).pathname.startsWith("/features/"))).toHaveLength(1);
    expect(mocks.httpsRequest).toHaveBeenCalledTimes(1);
  });

  it("finds diverse Spanish evidence after a long repeated navigation menu", async () => {
    const repeated = Array.from(
      { length: 120 },
      (_, index) => `<a href="/productos/funcion-${index}">Función ${index}</a>`,
    ).join("");
    fixtures.push({
      body: `<html><body><main><h1>Ejemplo</h1><p>Información útil.</p>${repeated}<a href="/productos">Productos</a><a href="/comparacion">Comparación</a><a href="/ayuda">Ayuda</a><a href="/noticias">Noticias</a><a href="/empresa">Empresa</a><a href="/clientes">Clientes</a></main></body></html>`,
    });

    const result = await readPublicPage({ url: "https://example.com/es" });

    if (!result.ok) throw new Error("expected page");
    expect(result.links.map(({ url }) => new URL(url).pathname)).toEqual(
      expect.arrayContaining(["/productos", "/comparacion", "/ayuda", "/noticias", "/empresa", "/clientes"]),
    );
    expect(result.links.filter(({ url }) => new URL(url).pathname.startsWith("/productos/"))).toHaveLength(1);
  });

  it("returns JSON within the existing result cap and marks truncation", async () => {
    fixtures.push({
      body: `<html><body><p>${'Useful "quoted" information.\n'.repeat(500)}</p>${Array.from({ length: 15 }, (_, index) => `<a href="/${"long-path".repeat(150)}-${index}">Page ${index}</a>`).join("")}</body></html>`,
    });
    const result = await readPublicPage({ url: "https://example.com/" });
    expect(result).toMatchObject({ ok: true, truncated: true });
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(6_000);
    if (!result.ok) throw new Error("expected page");
    expect(result.text.length).toBeGreaterThan(2_000);
    expect(result.links.length).toBeLessThanOrEqual(12);
  });

  it("rejects Unicode URLs that exceed the canonical URL bound without reading", async () => {
    expect(await readPublicPage({ url: `https://example.com/${"漢".repeat(300)}` })).toEqual({
      ok: false,
      reason: "invalid_url",
    });
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it.each([
    [{ headers: { "content-type": "application/pdf" } }, "unsupported_content"],
    [{ headers: { "content-type": "text/html", "content-encoding": "gzip" } }, "unsupported_content"],
    [{ headers: { "content-type": "text/html", "content-length": "512001" } }, "too_large"],
    [{ body: [Buffer.alloc(300_000), Buffer.alloc(212_001)] }, "too_large"],
    [{ statusCode: 403 }, "unavailable"],
    [{ statusCode: 302, headers: {} }, "unavailable"],
    [{ body: "<html><body><script>only script</script></body></html>" }, "empty_page"],
    [{ fail: true }, "unavailable"],
  ] as const)(
    "reports unsupported, oversized, unavailable, and empty pages without throwing",
    async (fixture, reason) => {
      fixtures.push(fixture);
      expect(await readPublicPage({ url: "https://example.com/" })).toEqual({
        ok: false,
        reason,
      });
      expect(responses.every((response) => response.destroyed)).toBe(true);
    },
  );

  it("accepts bounded plain text", async () => {
    fixtures.push({
      headers: { "content-type": "text/plain" },
      body: "Public information\n\nUseful details",
    });
    expect(await readPublicPage({ url: "https://example.com/" })).toMatchObject({
      ok: true,
      text: "Public information\n\nUseful details",
      links: [],
    });
  });

  it("honors cancellation during DNS without opening a connection", async () => {
    const controller = new AbortController();
    mocks.lookup.mockReturnValue(new Promise(() => {}));
    const result = readPublicPage({ url: "https://example.com/" }, { signal: controller.signal });
    controller.abort();
    expect(await result).toEqual({ ok: false, reason: "timeout" });
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
  });

  it("cancels stalled response bodies within the same total deadline", async () => {
    const controller = new AbortController();
    let body: Readable | undefined;
    mocks.httpsRequest.mockImplementationOnce((_url, options, callback) => {
      const emitter = new EventEmitter();
      return Object.assign(emitter, {
        end: () => {
          body = Object.assign(new Readable({ read() {} }), {
            statusCode: 200,
            headers: { "content-type": "text/html" },
          });
          options.signal.addEventListener("abort", () => body?.destroy(new Error("synthetic timeout")), { once: true });
          callback(body);
        },
      });
    });
    const result = readPublicPage({ url: "https://example.com/" }, { signal: controller.signal });
    await vi.waitFor(() => expect(mocks.httpsRequest).toHaveBeenCalledTimes(1));
    controller.abort();
    expect(await result).toEqual({ ok: false, reason: "timeout" });
    expect(body?.destroyed).toBe(true);
  });

  it("has a total timeout even if DNS never completes", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(controller.signal);
    mocks.lookup.mockReturnValue(new Promise(() => {}));
    const result = readPublicPage({ url: "https://example.com/" });
    expect(timeout).toHaveBeenCalledWith(15_000);
    controller.abort();
    expect(await result).toEqual({ ok: false, reason: "timeout" });
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
  });
});
