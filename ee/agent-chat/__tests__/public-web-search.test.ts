import { afterEach, describe, expect, it, vi } from "vitest";

import {
  executePublicWebSearch,
  PUBLIC_WEB_SEARCH_MAX_RESPONSE_BYTES,
  PUBLIC_WEB_SEARCH_MAX_RESULT_CHARACTERS,
  PUBLIC_WEB_SEARCH_TIMEOUT_MS,
} from "../public-web-search";

vi.mock("@/env", () => ({ env: { PERPLEXITY_API_KEY: "synthetic-env-key" } }));

const source = {
  title: "Example Domain",
  url: "https://example.com/",
  snippet: "An example for documentation.",
};
const response = (data: unknown = { id: "synthetic-request-1", results: [source] }, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
    ...init,
  });

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("executePublicWebSearch", () => {
  it("makes exactly one fixed POST using only the trimmed query and the configured key", async () => {
    const fetch = vi.fn().mockResolvedValue(response());
    expect(await executePublicWebSearch("  IANA example domains  ", { fetch })).toEqual({
      state: "settled",
      billed: true,
      providerRequestId: "synthetic-request-1",
      output: { ok: true, results: [source] },
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("https://api.perplexity.ai/search", {
      method: "POST",
      headers: {
        Authorization: "Bearer synthetic-env-key",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: "IANA example domains",
        max_results: 3,
        max_tokens: 1024,
        max_tokens_per_page: 512,
      }),
      redirect: "manual",
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
  });

  it.each([undefined, null, 42, "", "   ", "x".repeat(501), ["one", "two"], { query: "test", max_results: 20 }])(
    "refuses invalid input without dispatch: %j",
    async (query) => {
      const fetch = vi.fn();
      expect(await executePublicWebSearch(query, { fetch })).toMatchObject({
        state: "settled",
        billed: false,
        output: { ok: false },
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("accepts a 500-character query and ignores unsupported runtime option overrides", async () => {
    const fetch = vi.fn().mockResolvedValue(response());
    const options = {
      fetch,
      apiKey: "synthetic-injected-key",
      max_results: 20,
      max_tokens: 1_000_000,
      url: "https://elsewhere.example",
    };
    await executePublicWebSearch("x".repeat(500), options);
    expect(fetch.mock.calls[0][0]).toBe("https://api.perplexity.ai/search");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      query: "x".repeat(500),
      max_results: 3,
      max_tokens: 1024,
      max_tokens_per_page: 512,
    });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer synthetic-injected-key");
  });

  it.each(["", " ", "synthetic\nkey"])("refuses an unusable key without dispatch", async (apiKey) => {
    const fetch = vi.fn();
    expect(await executePublicWebSearch("example", { fetch, apiKey })).toMatchObject({
      state: "settled",
      billed: false,
      output: { ok: false },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses an already cancelled request before dispatch", async () => {
    const fetch = vi.fn();
    expect(
      await executePublicWebSearch("example", {
        fetch,
        abortSignal: AbortSignal.abort(),
      }),
    ).toMatchObject({ state: "settled", billed: false, output: { ok: false } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 422, 429, 500, 502, 503, 599])(
    "does not retry or bill a complete HTTP %i error",
    async (status) => {
      const fetch = vi.fn().mockResolvedValue(response({ error: "synthetic provider error" }, { status }));
      expect(await executePublicWebSearch("example", { fetch })).toMatchObject({
        state: "settled",
        billed: false,
        output: { ok: false },
      });
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it.each([301, 302, 303, 307, 308, 404, 408, 201])(
    "retains uncertainty without following or retrying HTTP %i",
    async (status) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(response({}, { status, headers: { location: "https://elsewhere.example" } }));
      expect(await executePublicWebSearch("example", { fetch })).toEqual({
        state: "uncertain",
      });
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it("retains uncertainty after network failure without retrying or exposing the error", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("synthetic-secret-network-error"));
    expect(await executePublicWebSearch("example", { fetch })).toEqual({
      state: "uncertain",
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("enforces the total timeout even when an injected fetch ignores AbortSignal", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>(() => {}));
    const pending = executePublicWebSearch("example", { fetch });
    await vi.advanceTimersByTimeAsync(PUBLIC_WEB_SEARCH_TIMEOUT_MS);
    expect(await pending).toEqual({ state: "uncertain" });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("retains uncertainty when cancellation happens during dispatch", async () => {
    const controller = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>(() => {}));
    const pending = executePublicWebSearch("example", {
      fetch,
      abortSignal: controller.signal,
    });
    controller.abort();
    expect(await pending).toEqual({ state: "uncertain" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("times out a response body that stops producing data", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetch = vi.fn().mockResolvedValue(
      new Response(new ReadableStream({ cancel }), {
        headers: { "content-type": "application/json" },
      }),
    );
    const pending = executePublicWebSearch("example", { fetch });
    await vi.advanceTimersByTimeAsync(PUBLIC_WEB_SEARCH_TIMEOUT_MS);
    expect(await pending).toEqual({ state: "uncertain" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("retains uncertainty after a connection error while reading an HTTP 200 body", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.error(new TypeError("connection interrupted"));
      },
    });
    const fetch = vi.fn().mockResolvedValue(new Response(body, { headers: { "content-type": "application/json" } }));
    expect(await executePublicWebSearch("example", { fetch })).toEqual({
      state: "uncertain",
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects a fully received invalid UTF-8 response as billed", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(Uint8Array.from([0xff, 0xfe]), {
        headers: { "content-type": "application/json" },
      }),
    );
    expect(await executePublicWebSearch("example", { fetch })).toMatchObject({
      state: "settled",
      billed: true,
      output: { ok: false },
    });
  });

  it.each([
    new Response("not json", {
      headers: { "content-type": "application/json" },
    }),
    new Response("{}", { headers: { "content-type": "text/html" } }),
    response({ results: "invalid" }),
    response({ results: [{ title: 1, url: source.url, snippet: "example" }] }),
  ])("records an unusable HTTP 200 as billed", async (value) => {
    const fetch = vi.fn().mockResolvedValue(value);
    expect(await executePublicWebSearch("example", { fetch })).toMatchObject({
      state: "settled",
      billed: true,
      output: { ok: false },
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("records a successful empty response as billed", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ id: "empty-request", results: [] }));
    expect(await executePublicWebSearch("example", { fetch })).toEqual({
      state: "settled",
      billed: true,
      providerRequestId: "empty-request",
      output: { ok: true, results: [] },
    });
  });

  it("bounds response bytes without trusting Content-Length", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response("é".repeat(PUBLIC_WEB_SEARCH_MAX_RESPONSE_BYTES / 2 + 1), {
        headers: {
          "content-type": "application/json",
          "content-length": "1",
        },
      }),
    );
    expect(await executePublicWebSearch("example", { fetch })).toMatchObject({
      state: "settled",
      billed: true,
      output: { ok: false },
    });
  });

  it("refuses an oversized declared response without consuming its body", async () => {
    const cancel = vi.fn();
    const fetch = vi.fn().mockResolvedValue(
      new Response(new ReadableStream({ cancel }), {
        headers: {
          "content-type": "application/json",
          "content-length": String(PUBLIC_WEB_SEARCH_MAX_RESPONSE_BYTES + 1),
        },
      }),
    );
    expect(await executePublicWebSearch("example", { fetch })).toMatchObject({
      state: "settled",
      billed: true,
      output: { ok: false },
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("retains uncertainty when a nonbilled status cannot be read completely within bounds", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response("x".repeat(PUBLIC_WEB_SEARCH_MAX_RESPONSE_BYTES + 1), {
        status: 503,
      }),
    );
    expect(await executePublicWebSearch("example", { fetch })).toEqual({
      state: "uncertain",
    });
  });

  it("keeps only unique validated HTTPS source URLs and removes fragments", async () => {
    const urls = [
      "javascript:alert(1)",
      "http://example.com",
      "https://user:password@example.com",
      "not a URL",
      `https://example.com/${"x".repeat(1000)}`,
      "https://example.com/#one",
      "https://example.com/#two",
      "https://example.org/",
      "https://example.net/",
      "https://fourth.example/",
    ];
    const fetch = vi.fn().mockResolvedValue(
      response({
        id: "bad\nrequest-id",
        results: urls.map((url) => ({ ...source, url })),
      }),
    );
    expect(await executePublicWebSearch("example", { fetch })).toEqual({
      state: "settled",
      billed: true,
      output: {
        ok: true,
        results: [source, { ...source, url: "https://example.org/" }, { ...source, url: "https://example.net/" }],
      },
    });
  });

  it("bounds titles, snippets, result count, and serialized JSON even with escaping", async () => {
    const fetch = vi.fn().mockResolvedValue(
      response({
        results: Array.from({ length: 4 }, (_, index) => ({
          title: '"'.repeat(300),
          url: `https://example.com/${index}/${"x".repeat(900)}`,
          snippet: "\u0000".repeat(400),
        })),
      }),
    );
    const result = await executePublicWebSearch("example", { fetch });
    expect(result.state).toBe("settled");
    if (result.state !== "settled") throw new Error("Expected a settled search.");
    expect(result.billed).toBe(true);
    expect(result.output.results).toHaveLength(3);
    expect(result.output.results?.every((item) => item.title.length <= 200 && item.snippet.length <= 1200)).toBe(true);
    expect(JSON.stringify(result.output).length).toBeLessThanOrEqual(PUBLIC_WEB_SEARCH_MAX_RESULT_CHARACTERS);
  });
});
