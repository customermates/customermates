import type { AddressInfo } from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";

import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isOperatorPrivateHost, requestProviderJson } from "../address-lookup-request";

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

const routes = new Map<string, Handler>();
const hits: string[] = [];
const server = createServer((request, response) => {
  hits.push(request.url ?? "");
  const handler = routes.get(new URL(request.url ?? "/", "http://local").pathname);
  if (handler) handler(request, response);
  else response.writeHead(404).end();
});
let origin = "";

const OPTIONS = { timeoutMs: 1_000, maxBytes: 1_024, userAgent: "lane-c-test" };

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  routes.set("/json", (request, response) => {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ agent: request.headers["user-agent"], host: request.headers.host }));
  });
  routes.set("/auth", (request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ authorization: request.headers.authorization ?? null }));
  });
  routes.set("/geojson", (_request, response) => {
    response.writeHead(200, { "content-type": "application/geo+json" });
    response.end('{"features":[]}');
  });
  routes.set("/html", (_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end("<html></html>");
  });
  routes.set("/redirect", (_request, response) => {
    response.writeHead(302, { location: `${origin}/json` });
    response.end();
  });
  routes.set("/error", (_request, response) => {
    response.writeHead(400, { "content-type": "application/json" });
    response.end('{"message":"unknown parameter"}');
  });
  routes.set("/declared-large", (_request, response) => {
    response.writeHead(200, { "content-type": "application/json", "content-length": "4096" });
    response.end(`"${"x".repeat(4094)}"`);
  });
  routes.set("/streamed-large", (_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.write(`"${"x".repeat(800)}`);
    response.end(`${"x".repeat(800)}"`);
  });
  routes.set("/compressed", (_request, response) => {
    response.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip" });
    response.end("{}");
  });
  routes.set("/invalid", (_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{not json");
  });
  routes.set("/slow", (_request, response) => {
    setTimeout(() => {
      if (response.destroyed || response.socket?.destroyed) return;
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    }, 1_500);
  });
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("address provider requests", () => {
  it("reads JSON from a host the operator configured on a private address", async () => {
    expect(await requestProviderJson(new URL(`${origin}/json`), OPTIONS)).toEqual({
      ok: true,
      body: { agent: "lane-c-test", host: new URL(origin).host },
    });
    expect(await requestProviderJson(new URL(`${origin}/geojson`), OPTIONS)).toEqual({
      ok: true,
      body: { features: [] },
    });
  });

  it("pins a private service name to the address it resolves to", async () => {
    const port = new URL(origin).port;
    const result = await requestProviderJson(new URL(`http://photon:${port}/json`), {
      ...OPTIONS,
      resolve: () => Promise.resolve([{ address: "127.0.0.1", family: 4 }]),
    });
    expect(result).toEqual({ ok: true, body: { agent: "lane-c-test", host: `photon:${port}` } });
  });

  it("refuses a public host name that resolves to a private address", async () => {
    const hitCount = hits.length;
    const result = await requestProviderJson(new URL(`http://photon.example.com:${new URL(origin).port}/json`), {
      ...OPTIONS,
      resolve: () => Promise.resolve([{ address: "127.0.0.1", family: 4 }]),
    });
    expect(result).toEqual({ ok: false, reason: "blocked" });
    expect(hits).toHaveLength(hitCount);
  });

  it("never follows a redirect and reports other statuses", async () => {
    const hitCount = hits.length;
    expect(await requestProviderJson(new URL(`${origin}/redirect`), OPTIONS)).toEqual({
      ok: false,
      reason: "status",
      status: 302,
    });
    expect(hits.slice(hitCount)).toEqual(["/redirect"]);
    expect(await requestProviderJson(new URL(`${origin}/error`), OPTIONS)).toEqual({
      ok: false,
      reason: "status",
      status: 400,
    });
  });

  it("refuses other content, compressed or invalid bodies and bodies over the size cap", async () => {
    expect(await requestProviderJson(new URL(`${origin}/html`), OPTIONS)).toEqual({
      ok: false,
      reason: "unsupported_content",
    });
    expect(await requestProviderJson(new URL(`${origin}/compressed`), OPTIONS)).toEqual({
      ok: false,
      reason: "unsupported_content",
    });
    expect(await requestProviderJson(new URL(`${origin}/invalid`), OPTIONS)).toEqual({
      ok: false,
      reason: "unsupported_content",
    });
    expect(await requestProviderJson(new URL(`${origin}/declared-large`), OPTIONS)).toEqual({
      ok: false,
      reason: "too_large",
    });
    expect(await requestProviderJson(new URL(`${origin}/streamed-large`), OPTIONS)).toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("gives up after the timeout", async () => {
    const started = Date.now();
    expect(await requestProviderJson(new URL(`${origin}/slow`), { ...OPTIONS, timeoutMs: 200 })).toEqual({
      ok: false,
      reason: "timeout",
    });
    expect(Date.now() - started).toBeLessThan(1_400);
  });

  it("refuses other protocols and sends credentials of the configured URL as basic auth", async () => {
    expect(await requestProviderJson(new URL("ftp://127.0.0.1/api"), OPTIONS)).toEqual({
      ok: false,
      reason: "blocked",
    });
    expect(
      await requestProviderJson(new URL(`http://user:secret@127.0.0.1:${new URL(origin).port}/auth`), OPTIONS),
    ).toEqual({ ok: true, body: { authorization: `Basic ${Buffer.from("user:secret").toString("base64")}` } });
  });

  it("treats only explicitly private host names as the operator's private network", () => {
    for (const host of ["localhost", "photon", "photon.internal", "geo.local", "api.home.arpa", "10.0.0.5", "::1"])
      expect(isOperatorPrivateHost(host), host).toBe(true);
    for (const host of ["photon.komoot.io", "photon.example.com", "8.8.8.8", "2606:4700:4700::1111"])
      expect(isOperatorPrivateHost(host), host).toBe(false);
  });
});
