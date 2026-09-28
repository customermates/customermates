import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchWebsiteResource, isPublicWebsiteAddress } from "../website-fetch";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  httpsRequest: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
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
  mocks.httpsRequest.mockImplementation(request);
});

const PAGE_TYPES = ["text/html", "application/xhtml+xml", "text/plain"] as const;

function fetchPage(input: { url: string; allowedDomain: string }, options: { signal?: AbortSignal } = {}) {
  return fetchWebsiteResource(
    {
      url: input.url,
      allows: (target) => target.registrableDomain === input.allowedDomain,
      accept: PAGE_TYPES,
      userAgent: "Customermates/1.0 (test)",
    },
    options,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("isPublicWebsiteAddress", () => {
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
    expect(isPublicWebsiteAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "93.184.215.14", "172.32.0.1", "2606:4700:4700::1111", "2001:4860:4860::8888"])(
    "accepts global public address %s",
    (address) => expect(isPublicWebsiteAddress(address)).toBe(true),
  );
});

describe("fetchWebsiteResource", () => {
  it("pins DNS while preserving the hostname, disables connection reuse, and returns the decoded body", async () => {
    const result = await fetchPage({ allowedDomain: "example.com", url: "https://example.com/" });
    expect(result).toMatchObject({ ok: true, url: "https://example.com/", contentType: "text/html" });
    if (!result.ok) throw new Error("expected page");
    expect(result.body).toContain("Useful public company information.");
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
    expect(await fetchPage({ url, allowedDomain: "example.com" })).toEqual({
      ok: false,
      reason: "invalid_url",
    });
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
  });

  it("rejects a mismatched allowlist and private-domain sibling before DNS", async () => {
    expect(
      await fetchPage({
        url: "https://example.com/",
        allowedDomain: "other.com",
      }),
    ).toEqual({ ok: false, reason: "outside_domain" });
    expect(
      await fetchPage({
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
    expect(await fetchPage({ allowedDomain: "example.com", url: "https://example.com/" })).toEqual({
      ok: false,
      reason: "blocked_address",
    });
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
  });

  it("pins IPv6 DNS answers without converting or changing the TLS hostname", async () => {
    mocks.lookup.mockResolvedValue([{ address: "2606:4700:4700::1111", family: 6 }]);
    expect((await fetchPage({ allowedDomain: "example.com", url: "https://example.com/" })).ok).toBe(true);
    const callback = vi.fn();
    mocks.httpsRequest.mock.calls[0][1].lookup("example.com", {}, callback);
    await new Promise((resolve) => process.nextTick(resolve));
    expect(callback).toHaveBeenCalledWith(null, "2606:4700:4700::1111", 6);
  });

  it("resolves and pins every redirect independently, including rebinding on the same host", async () => {
    fixtures.push({ statusCode: 302, headers: { location: "/en" } });
    mocks.lookup.mockResolvedValueOnce([{ address: "93.184.215.14", family: 4 }]);
    mocks.lookup.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    expect(await fetchPage({ allowedDomain: "example.com", url: "https://example.com/" })).toEqual({
      ok: false,
      reason: "blocked_address",
    });
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
    expect(mocks.httpsRequest).toHaveBeenCalledTimes(1);
    expect(responses[0].destroyed).toBe(true);
  });

  it("upgrades HTTP before the first request and follows same-domain redirects", async () => {
    fixtures.push({
      statusCode: 301,
      headers: { location: "https://www.example.com/en" },
    });
    const result = await fetchPage({ allowedDomain: "example.com", url: "http://example.com/" });
    expect(result).toMatchObject({
      ok: true,
      url: "https://www.example.com/en",
    });
    expect(mocks.httpsRequest).toHaveBeenCalledTimes(2);
  });

  it("upgrades an HTTP redirect target before following it", async () => {
    fixtures.push({ statusCode: 301, headers: { location: "http://www.example.com/en" } });
    expect(await fetchPage({ allowedDomain: "example.com", url: "https://example.com/" })).toMatchObject({
      ok: true,
      url: "https://www.example.com/en",
    });
    expect(mocks.httpsRequest.mock.calls.map(([url]) => url.href)).toEqual([
      "https://example.com/",
      "https://www.example.com/en",
    ]);
  });

  it("requests functional query parameters unchanged and strips only the fragment", async () => {
    fixtures.push({
      body: "<html><body><p>Details for offering 42.</p></body></html>",
    });
    const result = await fetchPage({
      allowedDomain: "example.com",
      url: "https://example.com/index.php?id=42&lang=en#details",
    });
    expect(mocks.httpsRequest.mock.calls[0][0].href).toBe("https://example.com/index.php?id=42&lang=en");
    expect(result).toMatchObject({ ok: true, url: "https://example.com/index.php?id=42&lang=en" });
  });

  it("preserves query-only redirects and reports the actual final page", async () => {
    fixtures.push({ statusCode: 302, headers: { location: "?id=43#details" } });
    const result = await fetchPage({
      allowedDomain: "example.com",
      url: "https://example.com/index.php?id=42#overview",
    });
    expect(mocks.httpsRequest.mock.calls.map(([url]) => url.href)).toEqual([
      "https://example.com/index.php?id=42",
      "https://example.com/index.php?id=43",
    ]);
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: true, url: "https://example.com/index.php?id=43" });
  });

  it.each([
    ["https://evil.com/", "outside_domain"],
    ["https://evil.com/index.php?id=42", "outside_domain"],
    ["https://127.0.0.1/", "invalid_url"],
    ["https://user:secret@example.com/", "invalid_url"],
    ["https://example.com:8080/", "invalid_url"],
  ])("blocks redirect to %s before a second network request", async (location, reason) => {
    fixtures.push({ statusCode: 302, headers: { location } });
    expect(await fetchPage({ allowedDomain: "example.com", url: "https://example.com/" })).toEqual({
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
    expect(await fetchPage({ allowedDomain: "example.com", url: "https://example.com/" })).toEqual({
      ok: false,
      reason: "redirect_limit",
    });
    expect(mocks.httpsRequest).toHaveBeenCalledTimes(4);
  });

  it("rejects Unicode URLs that exceed the canonical URL bound without reading", async () => {
    expect(await fetchPage({ allowedDomain: "example.com", url: `https://example.com/${"漢".repeat(300)}` })).toEqual({
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
    [{ fail: true }, "unavailable"],
  ] as const)("reports unsupported, oversized, and unavailable pages without throwing", async (fixture, reason) => {
    fixtures.push(fixture);
    expect(await fetchPage({ allowedDomain: "example.com", url: "https://example.com/" })).toMatchObject({
      ok: false,
      reason,
    });
    expect(responses.every((response) => response.destroyed)).toBe(true);
  });

  it("reads only the first 500 KiB of an oversized resource when the caller asks to truncate it", async () => {
    const rules = Buffer.from("User-agent: *\nDisallow: /private\n");
    fixtures.push({
      headers: { "content-type": "text/plain", "content-length": "700000" },
      body: [rules, Buffer.alloc(400_000, 0x23), Buffer.alloc(300_000, 0x23)],
    });
    const result = await fetchWebsiteResource({
      url: "https://example.com/robots.txt",
      allows: (target) => target.registrableDomain === "example.com",
      accept: ["text/plain"],
      userAgent: "Customermates/1.0 (test)",
      truncateOversized: true,
    });

    expect(result).toMatchObject({ ok: true, truncated: true });
    if (!result.ok) throw new Error("expected a truncated resource");
    expect(Buffer.byteLength(result.body)).toBe(512_000);
    expect(result.body.startsWith("User-agent: *\nDisallow: /private\n")).toBe(true);
    expect(responses.every((response) => response.destroyed)).toBe(true);

    fixtures.push({ headers: { "content-type": "text/plain" }, body: "User-agent: *\nAllow: /\n" });
    await expect(
      fetchWebsiteResource({
        url: "https://example.com/robots.txt",
        allows: () => true,
        accept: ["text/plain"],
        userAgent: "Customermates/1.0 (test)",
        truncateOversized: true,
      }),
    ).resolves.toMatchObject({ ok: true, truncated: false });
  });

  it("accepts bounded plain text", async () => {
    fixtures.push({
      headers: { "content-type": "text/plain" },
      body: "Public information\n\nUseful details",
    });
    expect(await fetchPage({ allowedDomain: "example.com", url: "https://example.com/" })).toMatchObject({
      ok: true,
      contentType: "text/plain",
      body: "Public information\n\nUseful details",
    });
  });

  it.each([
    ["the Content-Type charset", "text/html; charset=ISO-8859-1", ""],
    ["a meta charset", "text/html", '<meta charset="windows-1252">'],
    [
      "a meta http-equiv Content-Type",
      "text/html",
      '<meta http-equiv="Content-Type" content="text/html; charset=latin1">',
    ],
  ])("decodes a legacy single-byte page declared by %s", async (_source, contentType, meta) => {
    fixtures.push({
      headers: { "content-type": contentType },
      body: Buffer.from(
        `<html><head>${meta}<title>Über uns</title></head><body><p>Größe & Qualität für Kunden.</p></body></html>`,
        "latin1",
      ),
    });
    expect(await fetchPage({ allowedDomain: "example.com", url: "https://example.com/" })).toMatchObject({
      ok: true,
      body: expect.stringContaining("<title>Über uns</title></head><body><p>Größe & Qualität für Kunden.</p>"),
    });
  });

  it.each(["text/html; charset=x-unknown-label", "text/plain; charset=x-unknown-label"])(
    "falls back to UTF-8 for an unknown charset label in %s",
    async (contentType) => {
      fixtures.push({
        headers: { "content-type": contentType },
        body: Buffer.from("Über uns: Größe und Qualität.", "utf8"),
      });
      expect(await fetchPage({ allowedDomain: "example.com", url: "https://example.com/" })).toMatchObject({
        ok: true,
        body: "Über uns: Größe und Qualität.",
      });
    },
  );

  const utf16be = (html: string) => Buffer.from(html, "utf16le").swap16();
  it.each([
    ["UTF-8", "text/html; charset=ISO-8859-1", [0xef, 0xbb, 0xbf], (html: string) => Buffer.from(html, "utf8")],
    ["UTF-16LE", "text/html; charset=utf-8", [0xff, 0xfe], (html: string) => Buffer.from(html, "utf16le")],
    ["UTF-16BE", "text/html", [0xfe, 0xff], utf16be],
  ])("lets a %s byte order mark override the declared charset", async (_bom, contentType, mark, encode) => {
    const html =
      '<html><head><meta charset="windows-1252"><title>Über uns</title></head><body><p>Größe für Kunden.</p></body></html>';
    fixtures.push({
      headers: { "content-type": contentType },
      body: Buffer.from([...mark, ...encode(html)]),
    });
    expect(await fetchPage({ allowedDomain: "example.com", url: "https://example.com/" })).toMatchObject({
      ok: true,
      body: expect.stringContaining("<title>Über uns</title></head><body><p>Größe für Kunden.</p>"),
    });
  });

  it("does not let a meta tag switch an ASCII-readable page to UTF-16", async () => {
    fixtures.push({
      headers: { "content-type": "text/html" },
      body: Buffer.from('<html><head><meta charset="utf-16"></head><body><p>Über uns</p></body></html>', "utf8"),
    });
    expect(await fetchPage({ allowedDomain: "example.com", url: "https://example.com/" })).toMatchObject({
      ok: true,
      body: expect.stringContaining("<p>Über uns</p>"),
    });
  });

  it("honors cancellation during DNS without opening a connection", async () => {
    const controller = new AbortController();
    mocks.lookup.mockReturnValue(new Promise(() => {}));
    const result = fetchPage(
      { allowedDomain: "example.com", url: "https://example.com/" },
      { signal: controller.signal },
    );
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
    const result = fetchPage(
      { allowedDomain: "example.com", url: "https://example.com/" },
      { signal: controller.signal },
    );
    await vi.waitFor(() => expect(mocks.httpsRequest).toHaveBeenCalledTimes(1));
    controller.abort();
    expect(await result).toEqual({ ok: false, reason: "timeout" });
    expect(body?.destroyed).toBe(true);
  });

  it("has a total timeout even if DNS never completes", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(controller.signal);
    mocks.lookup.mockReturnValue(new Promise(() => {}));
    const result = fetchPage({ allowedDomain: "example.com", url: "https://example.com/" });
    expect(timeout).toHaveBeenCalledWith(15_000);
    controller.abort();
    expect(await result).toEqual({ ok: false, reason: "timeout" });
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
  });
});
